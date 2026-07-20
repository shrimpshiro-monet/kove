// src/components/affiliate/AffiliateCharts.tsx
import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import type { CommissionRecord, ReferredUser } from "@/stores/dashboard-store";

interface AffiliateChartsProps {
  commissionRecords: CommissionRecord[];
  referredUsers: ReferredUser[];
}

function aggregateByMonth(records: CommissionRecord[], referredUsers: ReferredUser[]) {
  const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  const now = Date.now();
  const msPerMonth = 30 * 86400000;

  return months.map((month, i) => {
    const cutoff = now - (5 - i) * msPerMonth;
    const referralsInMonth = referredUsers.filter((r) => r.joinedAt <= cutoff).length;
    const earningsInMonth = records
      .filter((r) => r.createdAt <= cutoff)
      .reduce((sum, r) => sum + r.amount, 0);

    return { name: month, referrals: referralsInMonth, earnings: earningsInMonth };
  });
}

function Toggle({ active, onChange }: { active: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {["6M", "1Y"].map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
            active === opt
              ? "bg-[var(--background-elevated)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--background-elevated)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs">
      <div className="text-[var(--text-muted)] mb-0.5">{label}</div>
      <div className="font-mono tabular-nums text-[var(--text-primary)]">{payload[0].value}</div>
    </div>
  );
};

export function AffiliateCharts({ commissionRecords, referredUsers }: AffiliateChartsProps) {
  const [referralRange, setReferralRange] = useState("6M");
  const [earningsRange, setEarningsRange] = useState("6M");

  const data = useMemo(() => aggregateByMonth(commissionRecords, referredUsers), [commissionRecords, referredUsers]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Referrals over time */}
      <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Referrals</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Total: <span className="font-mono tabular-nums text-[var(--text-secondary)]">{referredUsers.length}</span>
            </p>
          </div>
          <Toggle active={referralRange} onChange={setReferralRange} />
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b6b70" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b6b70" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="referrals" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Earnings over time */}
      <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Earnings</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Total: <span className="font-mono tabular-nums text-[var(--status-success)]">
                ${commissionRecords.reduce((s, r) => s + r.amount, 0).toLocaleString()}
              </span>
            </p>
          </div>
          <Toggle active={earningsRange} onChange={setEarningsRange} />
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b6b70" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b6b70" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="earnings" stroke="var(--accent)" strokeWidth={1.5} fill="url(#earningsGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
