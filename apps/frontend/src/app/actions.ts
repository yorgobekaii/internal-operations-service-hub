'use server'

import { revalidatePath } from 'next/cache';
import {
  SERVICE_REQUEST_ROUTES,
  USER_ROLE_HEADER,
  type ServiceRequestStatus,
} from '@internal/shared';

const API_BASE = 'http://localhost:3000';
const API_URL = `${API_BASE}${SERVICE_REQUEST_ROUTES.base}`;
const OPERATOR_ROLE = 'operator';

export async function createServiceRequest(formData: FormData) {
  const title = formData.get('title') as string;
  const category = formData.get('category') as string;

  if (!title || !category) {
    return { error: 'Title and category are required' };
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, category }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return { error: errorData.message || 'Failed to create request' };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: 'Failed to connect to backend' };
  }
}

export async function updateServiceRequestStatus(id: string, status: ServiceRequestStatus) {
  try {
    const res = await fetch(`${API_URL}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        [USER_ROLE_HEADER]: OPERATOR_ROLE,
      },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return { error: errorData.message || 'Failed to update status' };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: 'Failed to connect to backend' };
  }
}

