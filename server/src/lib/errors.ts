export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m = 'Bad request') => new HttpError(400, m, 'bad_request');
export const unauthorized = (m = 'Unauthorized') => new HttpError(401, m, 'unauthorized');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'not_found');
export const conflict = (m = 'Conflict') => new HttpError(409, m, 'conflict');
