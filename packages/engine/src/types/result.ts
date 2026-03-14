/**
 * Result type for error handling (functional programming approach)
 */

/** Success result */
export interface Success<T> {
  ok: true
  value: T
}

/** Error result */
export interface Failure<E> {
  ok: false
  error: E
}

/** Result type union */
export type Result<T, E = Error> = Success<T> | Failure<E>

/** Create a success result */
export function ok<T>(value: T): Success<T> {
  return { ok: true, value }
}

/** Create a failure result */
export function err<E>(error: E): Failure<E> {
  return { ok: false, error }
}

/** Check if result is success */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.ok
}

/** Check if result is failure */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return !result.ok
}
