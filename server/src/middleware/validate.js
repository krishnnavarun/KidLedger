import { AppError } from './errorHandler.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const formattedErrors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      return next(
        new AppError('Validation failed', 400, 'VALIDATION_ERROR', formattedErrors)
      );
    }

    // Assign sanitized & parsed data back to req[source]
    req[source] = result.data;
    next();
  };
}
