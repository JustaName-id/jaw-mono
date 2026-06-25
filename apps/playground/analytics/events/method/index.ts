import { METHOD_EXECUTED, MethodExecutedPayload } from './method-executed';

export const METHOD_EVENTS = {
  METHOD_EXECUTED,
} as const;

export interface MethodEventPayload {
  [METHOD_EXECUTED]: MethodExecutedPayload;
}
