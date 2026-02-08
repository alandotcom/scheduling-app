export const STANDARD_MODAL_MAX_WIDTH_CLASS = "max-w-4xl";

export const MOBILE_FIRST_MODAL_CONTENT_CLASS = `
fixed z-50 inset-0 md:inset-auto md:left-1/2 md:top-8 md:-translate-x-1/2
md:w-[calc(100vw-2rem)]
${STANDARD_MODAL_MAX_WIDTH_CLASS}
md:max-h-[calc(100dvh-4rem)] md:h-[min(86dvh,52rem)] md:min-h-[36rem]
overflow-hidden bg-background
md:rounded-xl md:border md:border-border md:shadow-xl
flex flex-col
`;
