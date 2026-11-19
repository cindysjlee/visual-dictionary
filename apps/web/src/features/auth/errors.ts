// Cognito(Amplify AuthError) 오류 이름 → 화면에 보일 한국어. 사용자 존재 노출 방지가 켜져 있어 로그인 실패는 이메일·비밀번호를 구분하지 않는다
const MESSAGES: Record<string, string> = {
  UsernameExistsException: "이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.",
  NotAuthorizedException: "이메일 또는 비밀번호가 맞지 않아요.",
  UserNotFoundException: "이메일 또는 비밀번호가 맞지 않아요.",
  UserNotConfirmedException: "이메일 인증이 아직 끝나지 않았어요.",
  CodeMismatchException: "인증 코드가 맞지 않아요. 메일의 6자리 코드를 다시 확인해 주세요.",
  ExpiredCodeException: "인증 코드가 만료됐어요. 코드를 다시 받아 주세요.",
  InvalidPasswordException: "비밀번호는 8자 이상이며 영문과 숫자를 포함해야 해요.",
  InvalidParameterException: "입력한 값을 다시 확인해 주세요.",
  LimitExceededException: "시도 횟수가 너무 많아요. 잠시 후 다시 시도해 주세요.",
  TooManyRequestsException: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  TooManyFailedAttemptsException: "실패가 너무 많아요. 잠시 후 다시 시도해 주세요.",
  CodeDeliveryFailureException: "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
  NetworkError: "네트워크에 연결할 수 없어요. 연결을 확인해 주세요.",
  AuthUnavailable: "로그인 기능을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
};

export const FALLBACK_MESSAGE = "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";

const nameOf = (error: unknown) => (typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "");

export const authMessage = (error: unknown): string => MESSAGES[nameOf(error)] ?? FALLBACK_MESSAGE;

/** 오류 이름이 name인지(예: 로그인 중 인증 미완료 → 코드 입력 화면으로) */
export const isAuthError = (error: unknown, name: string) => nameOf(error) === name;

/** 앱이 직접 만드는 오류(구현이 같은 이름을 쓰게 한다) */
export const authError = (name: string) => Object.assign(new Error(name), { name });
