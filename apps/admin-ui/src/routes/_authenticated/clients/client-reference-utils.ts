import type { CreateClientInput } from "@scheduling/dto";

interface BuildClientDetailDescriptionInput {
  email?: string | null;
  formattedPhone?: string | null;
  referenceId?: string | null;
}

export function buildClientDetailDescription({
  email,
  formattedPhone,
  referenceId,
}: BuildClientDetailDescriptionInput): string | undefined {
  const primaryContact = email ?? formattedPhone ?? undefined;

  if (referenceId) {
    return primaryContact ? `${primaryContact} • ${referenceId}` : referenceId;
  }

  return primaryContact;
}

export function sanitizeClientMutationInput(
  input: CreateClientInput,
): Omit<CreateClientInput, "referenceId"> {
  const { referenceId: _ignored, ...safeInput } = input;
  return safeInput;
}
