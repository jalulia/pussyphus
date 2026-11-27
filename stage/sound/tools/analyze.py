#!/usr/bin/env python3
"""analyze.py <dir> : loudness, peaks and a spectrogram sheet for every <id>.wav in <dir>.
Loudness follows ITU-R BS.1770-4 (K-weighting at 48 kHz, 400 ms blocks with 75% overlap,
-70 LUFS absolute gate, -10 LU relative gate). True peak is approximated with 4x oversampling.
Writes <dir>/levels.json and <dir>/<id>.png."""
import sys, os, json, wave
import numpy as np
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def read(path):
    with wave.open(path) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
    return sr, x.reshape(-1, ch).T

def kweight(x, sr):
    assert sr == 48000, 'coefficients are for 48 kHz'
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)

def block_loudness(z, sr, win, hop):
    n = z.shape[1]; W, H = int(win * sr), int(hop * sr)
    starts = np.arange(0, max(1, n - W + 1), H)
    ms = np.array([np.mean(z[:, s:s + W] ** 2, axis=1).sum() for s in starts])
    return starts / sr, ms

def lufs(ms):
    return -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))

def integrated(z, sr):
    t, ms = block_loudness(z, sr, 0.4, 0.1)
    l = lufs(ms); keep = l > -70
    if not keep.any(): return -99.0
    rel = lufs(ms[keep].mean()) - 10
    keep2 = keep & (l > rel)
    return float(lufs(ms[keep2].mean()))

def analyze(path, png):
    sr, x = read(path)
    z = kweight(x, sr)
    I = integrated(z, sr)
    tm, msm = block_loudness(z, sr, 0.4, 0.1)   # momentary
    ts, mss = block_loudness(z, sr, 3.0, 0.5)   # short-term
    mom, st = lufs(msm), lufs(mss)
    up = signal.resample_poly(x, 4, 1, axis=1)
    tp = 20 * np.log10(np.max(np.abs(up)) + 1e-12)
    sp = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    mono = x.mean(axis=0)
    f, P = signal.welch(mono, sr, nperseg=8192)
    tot = P.sum()
    band = lambda lo, hi: float(10 * np.log10(P[(f >= lo) & (f < hi)].sum() / tot + 1e-12))
    centroid = float((f * P).sum() / tot)
    # loudest 10 ms transient relative to the surrounding 400 ms (catches clicks and harsh hits)
    e10 = np.convolve(mono ** 2, np.ones(480) / 480, 'same')
    e400 = np.convolve(mono ** 2, np.ones(19200) / 19200, 'same')
    crest_local = float(10 * np.log10(np.max(e10[19200:-19200] / (e400[19200:-19200] + 1e-12))))
    corr = float(np.corrcoef(x[0], x[1])[0, 1])
    res = dict(seconds=round(x.shape[1] / sr, 2), integrated_lufs=round(I, 2), max_momentary_lufs=round(float(mom.max()), 2),
               max_shortterm_lufs=round(float(st.max()), 2), min_shortterm_lufs=round(float(st.min()), 2),
               loudness_range_st_p10_p95=round(float(np.percentile(st, 95) - np.percentile(st, 10)), 2),
               sample_peak_dbfs=round(sp, 2), true_peak_dbtp_approx=round(tp, 2), rms_dbfs=round(rms, 2),
               crest_db=round(tp - rms, 2), spectral_centroid_hz=round(centroid), lr_correlation=round(corr, 3),
               energy_share_db={'<120': band(0, 120), '120-500': band(120, 500), '500-2k': band(500, 2000),
                                '2k-5k': band(2000, 5000), '5k-10k': band(5000, 10000), '>10k': band(10000, 24000)},
               worst_10ms_over_400ms_db=round(crest_local, 2))
    # sheet: waveform envelope + loudness, spectrogram, average spectrum
    fig = plt.figure(figsize=(12, 7.2), dpi=110)
    gs = fig.add_gridspec(3, 2, height_ratios=[1, 2.3, 1.3], width_ratios=[4, 1.25], hspace=0.38, wspace=0.18)
    ax0 = fig.add_subplot(gs[0, 0])
    tt = np.arange(x.shape[1]) / sr
    step = 240
    env = np.abs(x).max(axis=0)[: (x.shape[1] // step) * step].reshape(-1, step).max(axis=1)
    ax0.fill_between(tt[::step][:len(env)], 20 * np.log10(env + 1e-6), -60, color='#8fb5a6', lw=0)
    ax0.plot(tm + 0.2, mom, color='#3a3030', lw=0.6, label='momentary LUFS')
    ax0.plot(ts + 1.5, st, color='#5fa58d', lw=1.6, label='short-term LUFS')
    ax0.axhline(-20, color='#3a3030', lw=0.6, ls=':')
    ax0.set_ylim(-60, 0); ax0.set_xlim(0, tt[-1]); ax0.set_ylabel('dB'); ax0.legend(loc='lower right', fontsize=7, frameon=False)
    ax0.set_title(f"{os.path.basename(path)}   integrated {I:.1f} LUFS   true peak {tp:.1f} dBTP   centroid {centroid:.0f} Hz", fontsize=9, loc='left')
    ax1 = fig.add_subplot(gs[1, 0])
    fs, tsg, S = signal.spectrogram(mono, sr, nperseg=2048, noverlap=1536, window='hann')
    ax1.pcolormesh(tsg, fs / 1000, 10 * np.log10(S + 1e-14), vmin=-130, vmax=-40, cmap='magma', shading='auto')
    ax1.set_ylim(0, 16); ax1.set_ylabel('kHz'); ax1.set_xlabel('s')
    ax2 = fig.add_subplot(gs[1, 1])
    m = (fs <= 16000)
    ax2.plot(10 * np.log10(S[m].mean(axis=1) + 1e-14), fs[m] / 1000, color='#3a3030', lw=0.8)
    ax2.set_ylim(0, 16); ax2.set_xlim(-140, -40); ax2.set_title('mean spectrum dB', fontsize=8)
    ax3 = fig.add_subplot(gs[2, 0])
    fl, tl, Sl = signal.spectrogram(mono, sr, nperseg=8192, noverlap=7168)
    ml = fl <= 1500
    ax3.pcolormesh(tl, fl[ml], 10 * np.log10(Sl[ml] + 1e-14), vmin=-130, vmax=-40, cmap='magma', shading='auto')
    ax3.set_ylabel('Hz (0-1500)'); ax3.set_xlabel('s')
    ax4 = fig.add_subplot(gs[2, 1]); ax4.axis('off')
    eb = res['energy_share_db']
    ax4.text(0, 1, '\n'.join([f"{k:>8}: {v:6.1f} dB" for k, v in eb.items()] + [f"10ms/400ms: {crest_local:.1f} dB", f"L/R corr: {corr:.2f}"]), va='top', family='monospace', fontsize=7.5)
    fig.savefig(png); plt.close(fig)
    return res

if __name__ == '__main__':
    d = sys.argv[1]
    out = {}
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.wav'):
            k = fn[:-4]; out[k] = analyze(os.path.join(d, fn), os.path.join(d, k + '.png'))
            print(k, json.dumps(out[k]))
    json.dump(out, open(os.path.join(d, 'levels.json'), 'w'), indent=1)
