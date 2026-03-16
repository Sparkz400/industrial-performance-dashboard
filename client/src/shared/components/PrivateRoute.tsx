import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import type { AuthUser } from '../../stores/useAuthStore';

interface PrivateRouteProps {
  children: React.ReactNode;
  requiredRole?: AuthUser['role'];
}

/**
 *
 * @param root0
 * @param root0.children
 * @param root0.requiredRole
 */
export default function PrivateRoute({ children, requiredRole }: PrivateRouteProps) {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
