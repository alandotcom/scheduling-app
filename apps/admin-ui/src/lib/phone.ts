import {
  AsYouType,
  getCountryCallingCode,
  parseIncompletePhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js/min";

const DEFAULT_PHONE_COUNTRY: CountryCode = "US";
const NANP_COUNTRIES = new Set<CountryCode>(["US", "CA"]);

function toDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatNanpPhone(digits: string): string {
  if (!digits) return "";

  if (digits.length === 11 && digits.startsWith("1")) {
    return `1 ${formatNanpPhone(digits.slice(1))}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return formatNanpPhone(digits.slice(0, 10));
}

function clampNationalToPossibleLength(
  raw: string,
  country: CountryCode,
): string {
  let digits = toDigits(raw);
  while (
    digits.length > 0 &&
    validatePhoneNumberLength(digits, country) === "TOO_LONG"
  ) {
    digits = digits.slice(0, -1);
  }
  return digits;
}

function clampInternationalToPossibleLength(raw: string): string {
  const digits = toDigits(raw);
  if (!digits) return "+";

  let clamped = `+${digits}`;
  while (
    clamped.length > 1 &&
    validatePhoneNumberLength(clamped) === "TOO_LONG"
  ) {
    clamped = clamped.slice(0, -1);
  }
  return clamped;
}

export function formatPhoneForDisplay(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed);
  if (!parsed) return trimmed;

  if (NANP_COUNTRIES.has(parsed.country ?? DEFAULT_PHONE_COUNTRY)) {
    return formatNanpPhone(parsed.nationalNumber);
  }

  return parsed.formatInternational();
}

export function deriveCountryFromPhone(
  value: string | null | undefined,
): CountryCode | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  return parsePhoneNumberFromString(trimmed)?.country;
}

export function formatPhoneInputAsYouType(
  raw: string,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): { formatted: string; detectedCountry?: CountryCode } {
  const normalized = parseIncompletePhoneNumber(raw);
  if (!normalized) return { formatted: "" };

  if (normalized.startsWith("+")) {
    const clampedInternational = clampInternationalToPossibleLength(normalized);
    const formatter = new AsYouType(country);
    const formattedInternational = formatter.input(clampedInternational);
    const detectedCountry = formatter.getCountry() ?? undefined;
    const callingCode = formatter.getCallingCode();

    if (callingCode === "1") {
      const digits = toDigits(clampedInternational);
      if (digits.length === 0) return { formatted: "+", detectedCountry };
      if (!digits.startsWith("1")) {
        return { formatted: formattedInternational, detectedCountry };
      }

      const nationalDigits = digits.slice(1);
      const formattedNational = formatNanpPhone(nationalDigits);
      return {
        formatted: formattedNational ? `+1 ${formattedNational}` : "+1",
        detectedCountry,
      };
    }

    return { formatted: formattedInternational, detectedCountry };
  }

  if (NANP_COUNTRIES.has(country)) {
    const digits = clampNationalToPossibleLength(normalized, country);
    return {
      formatted: formatNanpPhone(digits),
      detectedCountry: country,
    };
  }

  const clampedNational = clampNationalToPossibleLength(normalized, country);
  const formatter = new AsYouType(country);
  const formattedNational = formatter.input(clampedNational);
  if (/[^\d]/.test(formattedNational)) {
    return {
      formatted: formattedNational,
      detectedCountry: formatter.getCountry() ?? undefined,
    };
  }

  const digits = toDigits(clampedNational);
  if (!digits) {
    return {
      formatted: formattedNational,
      detectedCountry: formatter.getCountry() ?? undefined,
    };
  }

  const callingCode = getCountryCallingCode(country);
  const digitsForInternational = digits.replace(/^0+/, "");
  if (!digitsForInternational) {
    return {
      formatted: formattedNational,
      detectedCountry: formatter.getCountry() ?? undefined,
    };
  }

  const intlFormatter = new AsYouType();
  const formattedInternational = intlFormatter.input(
    `+${callingCode}${digitsForInternational}`,
  );
  const prefix = `+${callingCode}`;
  const formattedWithoutPrefix = formattedInternational.startsWith(prefix)
    ? formattedInternational.slice(prefix.length).trimStart()
    : formattedInternational;

  return {
    formatted: formattedWithoutPrefix || formattedNational,
    detectedCountry:
      intlFormatter.getCountry() ?? formatter.getCountry() ?? undefined,
  };
}
