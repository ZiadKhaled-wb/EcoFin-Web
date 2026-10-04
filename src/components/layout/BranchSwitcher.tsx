import { useSelectedBranch } from '@/features/me/useSelectedBranch';
import { CheckIcon, ChevronDownIcon } from '@/components/ui/Icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { t } from '@/i18n';

/** Branches come from `GET /api/auth/me`. The choice is client-side (the contract has no branch header). */
export default function BranchSwitcher() {
  const { branches, branch, selectBranch, isLoading, isError } = useSelectedBranch();
  if (isLoading || isError || !branch) {
    return isError ? (
      <span className="type-caption hidden sm:inline">{t('shell.branchesFailed')}</span>
    ) : null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t('shell.branch')}: ${branch.name}`}
          className="flex min-h-11 items-center gap-2 rounded-control border border-line px-3 text-sm font-medium hover:bg-paper"
        >
          <span className="max-w-32 truncate">{branch.name}</span>
          <ChevronDownIcon size={16} className="text-ink-mute" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t('shell.branch')}</DropdownMenuLabel>
        {branches.length === 0 && <p className="type-caption px-3 py-2">{t('shell.noBranches')}</p>}
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            icon={b.id === branch.id ? <CheckIcon /> : undefined}
            onSelect={() => selectBranch(b.id)}
          >
            {b.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
