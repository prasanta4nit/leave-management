import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { config } from './config';

let pool: CognitoUserPool | null = null;

function getPool(): CognitoUserPool {
  if (!pool) {
    pool = new CognitoUserPool({ UserPoolId: config.cognito.userPoolId, ClientId: config.cognito.clientId });
  }
  return pool;
}

export type SignInResult =
  | { status: 'SIGNED_IN' }
  | { status: 'NEW_PASSWORD_REQUIRED'; complete: (newPassword: string) => Promise<void> };

export function signIn(email: string, password: string): Promise<SignInResult> {
  const user = new CognitoUser({ Username: email, Pool: getPool() });
  const details = new AuthenticationDetails({ Username: email, Password: password });
  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: () => resolve({ status: 'SIGNED_IN' }),
      onFailure: (err) => reject(err),
      newPasswordRequired: () => {
        // First login with the temporary password Cognito emailed to the user.
        resolve({
          status: 'NEW_PASSWORD_REQUIRED',
          complete: (newPassword: string) =>
            new Promise<void>((res, rej) =>
              user.completeNewPasswordChallenge(newPassword, {}, { onSuccess: () => res(), onFailure: rej }),
            ),
        });
      },
    });
  });
}

export function currentSession(): Promise<CognitoUserSession | null> {
  const user = getPool().getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise((resolve) => {
    // getSession refreshes the tokens transparently when they have expired.
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      resolve(err || !session?.isValid() ? null : session);
    });
  });
}

export async function getIdToken(): Promise<string | null> {
  const session = await currentSession();
  return session ? session.getIdToken().getJwtToken() : null;
}

export function signOut(): void {
  getPool().getCurrentUser()?.signOut();
}

type CodeDelivery = { CodeDeliveryDetails?: { Destination?: string } } | undefined;

/** Emails a reset code. Resolves with the masked address it went to, e.g. "p***@s***". */
export function forgotPassword(email: string): Promise<string | null> {
  const user = new CognitoUser({ Username: email.trim().toLowerCase(), Pool: getPool() });
  const destination = (data: CodeDelivery) => data?.CodeDeliveryDetails?.Destination ?? null;
  return new Promise((resolve, reject) =>
    user.forgotPassword({
      onSuccess: (data: CodeDelivery) => resolve(destination(data)),
      onFailure: reject,
      inputVerificationCode: (data: CodeDelivery) => resolve(destination(data)),
    }),
  );
}

export function confirmPassword(email: string, code: string, newPassword: string): Promise<void> {
  const user = new CognitoUser({ Username: email.trim().toLowerCase(), Pool: getPool() });
  return new Promise((resolve, reject) =>
    user.confirmPassword(code, newPassword, { onSuccess: () => resolve(), onFailure: reject }),
  );
}

/** Plain-language message for Cognito sign-in / reset errors. */
export function describeAuthError(e: unknown): string {
  const err = e as { code?: string; name?: string; message?: string } | null;
  const code = err?.code ?? err?.name ?? '';
  const msg = err?.message ?? String(e);
  switch (code) {
    case 'UserNotFoundException':
      return "There's no LeaveDesk account for this email. Use your work email, or ask HR to add you.";
    case 'NotAuthorizedException':
      if (/cannot be reset in the current state/i.test(msg))
        return "Your account isn't activated yet. Sign in with the temporary password from your invite email, or ask HR to resend the invite.";
      if (/disabled/i.test(msg)) return 'Your account is disabled. Please contact HR.';
      if (/attempts exceeded/i.test(msg)) return 'Too many failed attempts. Please wait a few minutes and try again.';
      if (/temporary password has expired/i.test(msg)) return 'Your temporary password has expired. Ask HR to resend your invite.';
      return 'Incorrect email or password.';
    case 'CodeMismatchException':
      return "That code isn't right. Check the latest email and try again.";
    case 'ExpiredCodeException':
      return 'That code has expired. Go back and request a new one.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'InvalidPasswordException':
      return msg.replace(/^Password does not conform to policy:\s*/i, '');
    case 'InvalidParameterException':
      if (/no registered\/verified email/i.test(msg)) return "This account has no verified email to send a code to. Please contact HR.";
      return msg;
    case 'PasswordResetRequiredException':
      return 'You need to reset your password. Use "Forgot password?" below.';
    case 'UserNotConfirmedException':
      return 'Your account is not confirmed yet. Please contact HR.';
    default:
      return msg;
  }
}
