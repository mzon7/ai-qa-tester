import AuthLayout from "../features/sign-in-and-sign-out/components/AuthLayout";
import RedirectIfAuthenticated from "../features/sign-in-and-sign-out/components/RedirectIfAuthenticated";
import SignInForm from "../features/sign-in-and-sign-out/components/SignInForm";

export default function LoginPage() {
  return (
    <RedirectIfAuthenticated>
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </RedirectIfAuthenticated>
  );
}
