// Utility types for common patterns
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Type guards
export function isUserResponse(obj: any): obj is import('./index').UserResponse {
  return obj && typeof obj.id === 'string' && typeof obj.questionId === 'string';
}

// Type assertions with validation
export function assertIsUserSession(obj: any): asserts obj is import('./index').UserSession {
  if (!obj || typeof obj.id !== 'string') {
    throw new Error('Invalid UserSession object');
  }
}