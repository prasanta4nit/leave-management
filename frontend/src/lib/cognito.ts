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

export function forgotPassword(email: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: getPool() });
  return new Promise((resolve, reject) =>
    user.forgotPassword({ onSuccess: () => resolve(), onFailure: reject, inputVerificationCode: () => resolve() }),
  );
}

export function confirmPassword(email: string, code: string, newPassword: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: getPool() });
  return new Promise((resolve, reject) =>
    user.confirmPassword(code, newPassword, { onSuccess: () => resolve(), onFailure: reject }),
  );
}
