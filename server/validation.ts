import {
  decodeScenarioDefinition,
  decodeWorkspaceReplacement,
} from "../src/schemaDecoders";
import type { ScenarioDefinition, TwinLocation } from "../src/flywayTypes";
import type { WorkspaceReplacement } from "./types";

export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export function validateWorkspaceReplacement(
  value: unknown,
): WorkspaceReplacement {
  const decoded = decodeWorkspaceReplacement(value);
  if (!decoded.ok)
    throw new ValidationError(
      "Workspace payload failed validation.",
      decoded.errors,
    );
  return value as WorkspaceReplacement;
}

export function validateScenario(
  value: unknown,
  locations: TwinLocation[],
): ScenarioDefinition {
  const decoded = decodeScenarioDefinition(value, locations, "scenario");
  if (!decoded.ok)
    throw new ValidationError("Scenario failed validation.", decoded.errors);
  return value as ScenarioDefinition;
}
