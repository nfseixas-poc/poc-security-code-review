export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} não encontrado`);

export const invalidState = (message: string) => new AppError(409, 'invalid_state', message);

export const unauthorized = () => new AppError(401, 'unauthorized', 'Credenciais inválidas');
