'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import {
  OPERATOR_ROLES,
  SERVICE_REQUEST_ROUTES,
  USER_DEPT_HEADER,
  USER_ID_HEADER,
  USER_ROLE_HEADER,
  type AiTriageSuggestion,
  type OperatorRole,
  type ServiceRequestPriority,
  type ServiceRequestStatus,
} from '@internal/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const API_URL = `${API_BASE}${SERVICE_REQUEST_ROUTES.base}`;
const AI_TRIAGE_URL = `${API_BASE}${SERVICE_REQUEST_ROUTES.aiTriage}`;
const OPERATOR_ROLE: OperatorRole = OPERATOR_ROLES[0];

async function identityHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const store = await cookies();
    const id = store.get(USER_ID_HEADER)?.value ?? store.get('x-user-id')?.value;
    const role = store.get(USER_ROLE_HEADER)?.value ?? store.get('x-user-role')?.value;
    const dept = store.get(USER_DEPT_HEADER)?.value ?? store.get('x-user-dept')?.value;
    if (id) headers[USER_ID_HEADER] = id;
    if (role) headers[USER_ROLE_HEADER] = role;
    if (dept) headers[USER_DEPT_HEADER] = dept;
  } catch {
    // cookies() unavailable (e.g. prerender) — fall back to anonymous.
  }
  return headers;
}

export async function createServiceRequest(formData: FormData) {
  const title = formData.get('title') as string;
  const category = formData.get('category') as string;
  const priority = (formData.get('priority') as string) || undefined;

  if (!title || !category) {
    return { error: 'Title and category are required' };
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: await identityHeaders(),
      body: JSON.stringify(
        priority ? { title, category, priority } : { title, category },
      ),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return { error: errorData.message || 'Failed to create request' };
    }

    revalidatePath('/');
    revalidatePath('/new');
    revalidatePath('/approvals');
    return { success: true };
  } catch {
    return { error: 'Failed to connect to backend' };
  }
}

export async function suggestTriage(
  description: string,
): Promise<{ suggestion?: AiTriageSuggestion; error?: string }> {
  if (!description || description.trim().length < 3) {
    return { error: 'Describe your need in a few words first.' };
  }
  try {
    const res = await fetch(AI_TRIAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.trim() }),
      cache: 'no-store',
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { message?: string | string[] };
        const msg = Array.isArray(body.message)
          ? body.message.join('; ')
          : body.message;
        if (msg) detail = ` (${msg.slice(0, 160)})`;
      } catch {
        detail = '';
      }
      if (res.status === 400) return { error: 'Please add a little more detail.' };
      if (res.status === 502)
        return {
          error: `AI assistant is unavailable right now${detail} — fill the form manually.`,
        };
      return { error: `AI assistant failed${detail} — fill the form manually.` };
    }
    const suggestion = (await res.json()) as AiTriageSuggestion;
    return { suggestion };
  } catch {
    return { error: 'Could not reach the AI assistant.' };
  }
}

export async function updateServiceRequestStatus(
  id: string,
  status: ServiceRequestStatus,
) {
  try {
    const headers = await identityHeaders();
    if (!headers[USER_ROLE_HEADER]) headers[USER_ROLE_HEADER] = OPERATOR_ROLE;
    const res = await fetch(`${API_URL}/${id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return { error: errorData.message || 'Failed to update status' };
    }

    revalidatePath('/');
    revalidatePath('/approvals');
    return { success: true };
  } catch {
    return { error: 'Failed to connect to backend' };
  }
}

export async function approveServiceRequest(id: string) {
  try {
    const headers = await identityHeaders();
    if (!headers[USER_ROLE_HEADER]) headers[USER_ROLE_HEADER] = OPERATOR_ROLE;
    const res = await fetch(`${API_URL}/${id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return { error: errorData.message || 'Failed to approve request' };
    }

    revalidatePath('/');
    revalidatePath('/approvals');
    return { success: true };
  } catch {
    return { error: 'Failed to connect to backend' };
  }
}

export async function rejectServiceRequest(id: string, rationale: string) {
  if (!rationale || rationale.trim().length === 0) {
    return { error: 'A rejection rationale is required.' };
  }
  try {
    const headers = await identityHeaders();
    if (!headers[USER_ROLE_HEADER]) headers[USER_ROLE_HEADER] = OPERATOR_ROLE;
    const res = await fetch(`${API_URL}/${id}/reject`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rationale: rationale.trim() }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return { error: errorData.message || 'Failed to reject request' };
    }

    revalidatePath('/');
    revalidatePath('/approvals');
    return { success: true };
  } catch {
    return { error: 'Failed to connect to backend' };
  }
}

export type { ServiceRequestPriority };
