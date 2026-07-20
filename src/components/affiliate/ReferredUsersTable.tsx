// src/components/affiliate/ReferredUsersTable.tsx
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ReferredUser, CommissionRecord } from "@/stores/dashboard-store";

interface ReferredUsersTableProps {
  referredUsers: ReferredUser[];
  commissionRecords: CommissionRecord[];
}

const TIER_COLORS: Record<string, string> = {
  free: "#6b6b70",
  flux: "var(--accent)",
  nova: "#34d399",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "text-[var(--status-success)]" },
  pending: { label: "Pending", className: "text-[var(--status-pending)]" },
  churned: { label: "Churned", className: "text-[var(--status-error)]" },
};

function getCommissionForUser(userId: string, records: CommissionRecord[]) {
  return records
    .filter((r) => r.referredUserId === userId)
    .reduce((sum, r) => sum + r.amount, 0);
}

function getLatestRate(userId: string, records: CommissionRecord[]) {
  const userRecords = records.filter((r) => r.referredUserId === userId);
  return userRecords.length > 0 ? userRecords[userRecords.length - 1].rate : 0;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export function ReferredUsersTable({ referredUsers, commissionRecords }: ReferredUsersTableProps) {
  return (
    <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-[var(--border)] hover:bg-transparent">
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10">User</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Total spend</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Plan</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Rate</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Earned</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {referredUsers.map((user) => {
            const status = STATUS_CONFIG[user.status];
            const earned = getCommissionForUser(user.id, commissionRecords);
            const rate = getLatestRate(user.id, commissionRecords);
            return (
              <TableRow key={user.id} className="border-b border-[var(--border)] hover:bg-white/[0.02]">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: TIER_COLORS[user.planTier] }}
                    >
                      {user.avatarInitials}
                    </div>
                    <span className="text-sm text-[var(--text-primary)] font-medium">{user.username}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-sm text-[var(--text-secondary)]">
                  {formatCurrency(user.totalSpend)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-xs font-medium capitalize" style={{ color: TIER_COLORS[user.planTier] }}>
                    {user.planTier}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-sm text-[var(--text-secondary)]">
                  {rate}%
                </TableCell>
                <TableCell className={cn("text-right font-mono tabular-nums text-sm", earned > 0 ? "text-[var(--status-success)]" : "text-[var(--text-muted)]")}>
                  {formatCurrency(earned)}
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn("text-xs font-medium", status.className)}>
                    {status.label}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
