export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          DEFAULT: "var(--color-brand)",
          fg: "var(--color-brand-fg)",
          muted: "var(--color-brand-muted)",
          active: "var(--color-brand-active)",
          border: "var(--color-brand-border)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)",
        },
        background: "var(--color-background)",
        surface: {
          DEFAULT: "var(--color-surface)",
          alt: "var(--color-surface-alt)",
        },
        highlight: "var(--color-highlight)",
        foreground: "var(--color-foreground)",
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          soft: "var(--color-border-soft)",
        },
        accent: {
          soft: "var(--color-accent-soft)",
          softfg: "var(--color-accent-soft-fg)",
          line: "var(--color-accent-line)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          fg: "var(--color-success-fg)",
          soft: "var(--color-success-soft)",
          border: "var(--color-success-border)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          soft: "var(--color-warning-soft)",
          border: "var(--color-warning-border)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          fg: "var(--color-danger-fg)",
          soft: "var(--color-danger-soft)",
          border: "var(--color-danger-border)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
};
