export type ResolveSelectValueLabelArgs<T> = {
  value: string | null | undefined;
  options: readonly T[];
  getOptionValue: (option: T) => string;
  getOptionLabel: (option: T) => string;
  noneValue?: string;
  noneLabel?: string;
  unknownLabel?: string;
};

export function resolveSelectValueLabel<T>({
  value,
  options,
  getOptionValue,
  getOptionLabel,
  noneValue = "none",
  noneLabel = "None",
  unknownLabel = "Unknown selection",
}: ResolveSelectValueLabelArgs<T>): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value === noneValue) {
    return noneLabel;
  }

  const matchedOption = options.find(
    (option) => getOptionValue(option) === value,
  );
  if (matchedOption) {
    return getOptionLabel(matchedOption);
  }

  return unknownLabel;
}
