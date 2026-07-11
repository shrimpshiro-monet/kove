#![deny(clippy::all)]
use napi_derive::napi;

/// Snap cut times to nearest transient within maxDrift. Returns snapped times.
#[napi]
pub fn snap_cuts(cut_times: Vec<f64>, grid: Vec<f64>, max_drift: f64) -> Vec<f64> {
    cut_times
        .iter()
        .map(|&t| nearest(t, &grid, max_drift).unwrap_or(t))
        .collect()
}

fn nearest(t: f64, grid: &[f64], max_drift: f64) -> Option<f64> {
    if grid.is_empty() {
        return None;
    }
    let mut best = grid[0];
    let mut best_d = (grid[0] - t).abs();
    for &g in grid {
        let d = (g - t).abs();
        if d < best_d {
            best_d = d;
            best = g;
        }
    }
    if best_d <= max_drift {
        Some(best)
    } else {
        None
    }
}

/// Greedy motion-continuity ordering. Inputs are parallel arrays.
/// Returns the reordered index sequence.
#[napi]
pub fn continuity_order(dirs: Vec<i32>, energies: Vec<f64>) -> Vec<u32> {
    let n = dirs.len();
    if n == 0 {
        return vec![];
    }
    let mut used = vec![false; n];
    let mut order = Vec::with_capacity(n);
    order.push(0u32);
    used[0] = true;

    for _ in 1..n {
        let last = *order.last().unwrap() as usize;
        let mut bi = usize::MAX;
        let mut bc = f64::INFINITY;
        for j in 0..n {
            if used[j] {
                continue;
            }
            let dir_cost = (dirs[last] - dirs[j]).abs() as f64;
            let en_cost = (energies[last] - energies[j]).abs() * 0.5;
            let c = dir_cost + en_cost;
            if c < bc {
                bc = c;
                bi = j;
            }
        }
        used[bi] = true;
        order.push(bi as u32);
    }
    order
}

/// DTW distance between two normalized energy curves (for StyleMatchReport).
/// Lower = closer match. Sakoe-Chiba band optional via `window`.
#[napi]
pub fn dtw_distance(a: Vec<f64>, b: Vec<f64>, window: i32) -> f64 {
    let (n, m) = (a.len(), b.len());
    if n == 0 || m == 0 {
        return f64::INFINITY;
    }
    let w = if window <= 0 {
        (n.max(m)) as i32
    } else {
        window.max((n as i32 - m as i32).abs())
    };
    let mut dp = vec![vec![f64::INFINITY; m + 1]; n + 1];
    dp[0][0] = 0.0;
    for i in 1..=n {
        let jlo = (1).max(i as i32 - w) as usize;
        let jhi = (m as i32).min(i as i32 + w) as usize;
        for j in jlo..=jhi {
            let cost = (a[i - 1] - b[j - 1]).abs();
            let m3 = dp[i - 1][j].min(dp[i][j - 1]).min(dp[i - 1][j - 1]);
            dp[i][j] = cost + m3;
        }
    }
    dp[n][m]
}

/// Detect velocity U-curve (speed-ramp candidate) from per-shot magnitudes.
#[napi]
pub fn is_velocity_ramp(mags: Vec<f64>) -> bool {
    let n = mags.len();
    if n < 5 {
        return false;
    }
    let third = (n / 3).max(1);
    let mean = |s: &[f64]| s.iter().sum::<f64>() / s.len() as f64;
    let early = mean(&mags[..third]);
    let mid = mean(&mags[third..2 * third]);
    let late = mean(&mags[2 * third..]);
    mid < early * 0.7 && mid < late * 0.7
}
