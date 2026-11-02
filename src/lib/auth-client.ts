import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// No redirect handler: the sign-in form reads `twoFactorRedirect` and shows the code step itself.
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword, twoFactor } = authClient;
