export function ApplePayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 32" className={className} aria-hidden height="22">
      <path
        fill="currentColor"
        d="M19.3 7.6c-1 1.2-2.6 2.1-4.1 2-.2-1.6.5-3.2 1.4-4.3C17.6 4.1 19.3 3 20.8 3c.2 1.6-.4 3.2-1.5 4.6zm1.5 2.2c-2.3-.1-4.3 1.3-5.4 1.3-1.1 0-2.8-1.2-4.6-1.2-2.4 0-4.5 1.4-5.7 3.5-2.5 4.2-.6 10.5 1.7 13.9 1.1 1.7 2.5 3.5 4.3 3.5 1.7 0 2.4-1.1 4.5-1.1 2.1 0 2.7 1.1 4.6 1.1 1.9 0 3.1-1.7 4.3-3.4 1.3-1.9 1.8-3.8 1.9-3.9-.1 0-3.5-1.3-3.5-5.3 0-3.3 2.7-4.9 2.8-5 1.6-1.1.5-3.3-1-4.3-1.3-.9-2.7-.8-3.9-.1z"
      />
      <text x="32" y="23" fill="currentColor" fontSize="18" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="500">
        Pay
      </text>
    </svg>
  );
}

export function GooglePayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 86 32" className={className} aria-hidden height="20">
      <path fill="#4285F4" d="M19.5 16.2c0-.9-.1-1.8-.2-2.6H10v4.9h5.3c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.2 3-7.8z" />
      <path fill="#34A853" d="M10 24.5c2.7 0 5-0.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H1.1v2.6C2.7 22.8 6.1 24.5 10 24.5z" />
      <path fill="#FBBC05" d="M4.4 16.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V10H1.1C.4 11.4 0 12.9 0 14.6s.4 3.2 1.1 4.6l3.3-2.7z" />
      <path fill="#EA4335" d="M10 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9C14.9 2.8 12.6 1.8 10 1.8 6.1 1.8 2.7 3.5 1.1 6.9L4.4 9.5C5.2 7.2 7.4 5.9 10 5.9z" />
      <text x="26" y="22" fill="currentColor" fontSize="16" fontFamily="system-ui, sans-serif" fontWeight="500">
        Pay
      </text>
    </svg>
  );
}

export function CardMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" className={className} aria-hidden width="28" height="21">
      <rect width="32" height="24" rx="4" fill="currentColor" opacity="0.15" />
      <rect x="0" y="6" width="32" height="5" fill="currentColor" opacity="0.45" />
      <rect x="4" y="16" width="10" height="3" rx="1" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
