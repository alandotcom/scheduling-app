import {
  AsYouType,
  parseIncompletePhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

const DEFAULT_PHONE_COUNTRY: CountryCode = "US";
const NANP_COUNTRIES = new Set<CountryCode>(["US", "CA"]);

function toDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatNanpPhone(digits: string): string {
  if (!digits) return "";

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)} ${digits.slice(10)}`;
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
    const formatter = new AsYouType(country);
    const formattedInternational = formatter.input(normalized);
    const detectedCountry = formatter.getCountry() ?? undefined;
    const callingCode = formatter.getCallingCode();

    if (callingCode === "1") {
      const digits = toDigits(normalized);
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
    return {
      formatted: formatNanpPhone(toDigits(normalized)),
      detectedCountry: country,
    };
  }

  const formatter = new AsYouType(country);
  return {
    formatted: formatter.input(normalized),
    detectedCountry: formatter.getCountry() ?? undefined,
  };
}
