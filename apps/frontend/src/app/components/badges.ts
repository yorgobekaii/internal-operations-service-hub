import type {
  ServiceRequestCategory,
  ServiceRequestPriority,
  ServiceRequestStatus,
} from '@internal/shared';

export function statusBadge(status: ServiceRequestStatus): string {
  switch (status) {
    case 'Submitted':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'Pending Approval':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'In Progress':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'Blocked':
      return 'border-orange-200 bg-orange-50 text-orange-800';
    case 'Resolved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'Declined':
      return 'border-slate-200 bg-slate-100 text-slate-600';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600';
  }
}

export function priorityBadge(priority: ServiceRequestPriority): string {
  switch (priority) {
    case 'Urgent':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'High':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'Standard':
      return 'border-slate-200 bg-slate-100 text-slate-700';
    case 'Low':
      return 'border-cyan-200 bg-cyan-50 text-cyan-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

export function categoryBadge(category: ServiceRequestCategory): string {
  switch (category) {
    case 'IT':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'HR':
      return 'border-pink-200 bg-pink-50 text-pink-700';
    case 'Finance':
      return 'border-teal-200 bg-teal-50 text-teal-700';
    case 'Operations':
      return 'border-lime-200 bg-lime-50 text-lime-800';
    case 'Legal':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
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
