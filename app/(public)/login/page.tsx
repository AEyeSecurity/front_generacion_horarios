import LoginForm from "@/components/forms/LoginForm";

export default function LoginPage() {
  return (
    <div className="max-w-sm mx-auto mt-16 bg-white p-6 rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <LoginForm />
    </div>
  );
}
