import AuthLayout from "../features/sign-in-and-sign-out/components/AuthLayout";
import RedirectIfAuthenticated from "../features/sign-in-and-sign-out/components/RedirectIfAuthenticated";
import SignUpForm from "../features/sign-in-and-sign-out/components/SignUpForm";

export default function SignupPage() {
  return (
    <RedirectIfAuthenticated>
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </RedirectIfAuthenticated>
  );
}
