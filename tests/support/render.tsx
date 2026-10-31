import { NextIntlClientProvider } from "next-intl";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { Locale } from "@/i18n/config";

type Props = {
  children: ReactNode;
  messages: Record<string, unknown>;
  locale?: Locale;
};

function IntlWrapper({ children, messages, locale = "en" }: Props) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

export function renderWithIntl(ui: ReactElement, messages: Record<string, unknown>, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, {
    wrapper: ({ children }) => <IntlWrapper messages={messages}>{children}</IntlWrapper>,
    ...options,
  });
}
