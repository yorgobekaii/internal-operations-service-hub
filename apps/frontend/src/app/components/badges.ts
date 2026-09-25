import type {
  ServiceRequestCategory,
  ServiceRequestPriority,
  ServiceRequestStatus,
} from '@internal/shared';

export function statusBadge(status: ServiceRequestStatus): string {
  switch (status) {
    case 'Submitted':
      return 'bg-sky-500/15 text-sky-300 border-sky-400/30';
    case 'Pending Approval':
      return 'bg-violet-500/15 text-violet-300 border-violet-400/30';
    case 'In Progress':
      return 'bg-amber-500/15 text-amber-300 border-amber-400/30';
    case 'Blocked':
      return 'bg-orange-500/15 text-orange-300 border-orange-400/30';
    case 'Resolved':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30';
    case 'Declined':
      return 'bg-slate-500/15 text-slate-400 border-slate-400/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-400/30';
  }
}

export function priorityBadge(priority: ServiceRequestPriority): string {
  switch (priority) {
    case 'Urgent':
      return 'bg-rose-500/20 text-rose-200 border-rose-400/40';
    case 'High':
      return 'bg-orange-500/15 text-orange-200 border-orange-400/30';
    case 'Standard':
      return 'bg-slate-500/15 text-slate-300 border-slate-400/25';
    case 'Low':
      return 'bg-cyan-500/10 text-cyan-200 border-cyan-400/25';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-400/25';
  }
}

export function categoryBadge(category: ServiceRequestCategory): string {
  switch (category) {
    case 'IT':
      return 'bg-indigo-500/15 text-indigo-200 border-indigo-400/30';
    case 'HR':
      return 'bg-pink-500/15 text-pink-200 border-pink-400/30';
    case 'Finance':
      return 'bg-teal-500/15 text-teal-200 border-teal-400/30';
    case 'Operations':
      return 'bg-lime-500/10 text-lime-200 border-lime-400/25';
    case 'Legal':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-400/25';
  }
}

export function nextStatusFor(status: ServiceRequestStatus): {
  next: ServiceRequestStatus | null;
  label: string;
  classes: string;
} {
  switch (status) {
    case 'Submitted':
      return {
        next: 'In Progress',
        label: 'Start Work',
        classes: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
      };
    case 'Pending Approval':
      return {
        next: 'In Progress',
        label: 'Approve',
        classes: 'bg-violet-500 hover:bg-violet-400 text-white',
      };
    case 'In Progress':
      return {
        next: 'Resolved',
        label: 'Resolve',
        classes: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
      };
    case 'Blocked':
      return {
        next: 'In Progress',
        label: 'Resume',
        classes: 'bg-orange-500 hover:bg-orange-400 text-slate-950',
      };
    default:
      return { next: null, label: '', classes: '' };
  }
}
