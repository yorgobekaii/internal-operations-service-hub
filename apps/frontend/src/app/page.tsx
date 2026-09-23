import { createServiceRequest, updateServiceRequestStatus } from './actions';
import {
  SERVICE_REQUEST_ROUTES,
  type ServiceRequest,
  type ServiceRequestStatus,
} from '@internal/shared';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function badgeClass(status: ServiceRequestStatus): string {
  switch (status) {
    case 'Submitted':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Pending Approval':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'In Progress':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'Blocked':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'Resolved':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'Declined':
      return 'bg-gray-100 text-gray-600 border-gray-300';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

function nextStatusFor(status: ServiceRequestStatus): ServiceRequestStatus | null {
  switch (status) {
    case 'Submitted':
      return 'In Progress';
    case 'Pending Approval':
      return 'In Progress';
    case 'In Progress':
      return 'Resolved';
    case 'Blocked':
      return 'In Progress';
    default:
      return null;
  }
}

export default async function Page() {
  let requests: ServiceRequest[] = [];
  try {
    const res = await fetch(`${API_BASE}${SERVICE_REQUEST_ROUTES.base}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      requests = await res.json();
    }
  } catch (err) {
    console.error('Failed to fetch requests', err);
  }

  return (
    <main className="p-8 max-w-4xl mx-auto space-y-8 bg-gray-50 min-h-screen text-black">
      <h1 className="text-3xl font-bold text-gray-800">Internal Service Requests</h1>
      
      <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl mb-4 font-semibold text-gray-800">Submit a Request</h2>
        <form action={async (formData: FormData) => {
          'use server';
          await createServiceRequest(formData);
        }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input name="title" required className="border border-gray-300 p-2 w-full rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="E.g., Need access to Jira" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select name="category" required className="border border-gray-300 p-2 w-full rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              <option value="">Select a category...</option>
              <option value="IT">IT</option>
              <option value="HR">HR</option>
              <option value="Finance">Finance</option>
              <option value="Operations">Operations</option>
            </select>
          </div>
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded transition-colors">Submit Request</button>
        </form>
      </section>

      <section>
        <h2 className="text-xl mb-4 font-semibold text-gray-800">Active Requests</h2>
        {requests.length === 0 ? (
          <p className="text-gray-500 italic">No requests found.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((req: ServiceRequest) => (
              <div key={req.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-900">{req.title}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="inline-block bg-gray-100 px-2 py-0.5 rounded text-xs mr-2 border">{req.category}</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs border ${badgeClass(req.status)}`}>
                      {req.status}
                    </span>
                  </p>
                </div>
                <form action={async () => {
                  'use server';
                  const next = nextStatusFor(req.status);
                  if (next) {
                    await updateServiceRequestStatus(req.id, next);
                  }
                }}>
                  {req.status === 'Submitted' && (
                    <button type="submit" className="bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-3 py-1.5 rounded text-sm transition-colors shadow-sm">Start Work</button>
                  )}
                  {req.status === 'Pending Approval' && (
                    <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-3 py-1.5 rounded text-sm transition-colors shadow-sm">Approve</button>
                  )}
                  {req.status === 'In Progress' && (
                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded text-sm transition-colors shadow-sm">Resolve</button>
                  )}
                  {req.status === 'Blocked' && (
                    <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-3 py-1.5 rounded text-sm transition-colors shadow-sm">Resume</button>
                  )}
                  {req.status === 'Resolved' && (
                    <span className="text-green-600 font-bold px-3 py-1.5 text-sm flex items-center">
                      <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                      Completed
                    </span>
                  )}
                  {req.status === 'Declined' && (
                    <span className="text-gray-500 font-medium px-3 py-1.5 text-sm">Declined</span>
                  )}
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
