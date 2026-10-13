import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button, Card, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { user, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (user) return <Navigate to="/" replace />;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void login(String(data.get("email")), String(data.get("password"))).catch((err: Error) => setError(err.message));
  }

  return (
    <main className="mx-auto mt-16 max-w-md">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Offer Compare RO</h1>
        <p className="mt-1 text-sm text-zinc-500">Email login. Your offers stay private to this account.</p>
        <form className="mt-3 grid gap-3" onSubmit={onSubmit} noValidate={false}>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit">Log in</Button>
        </form>
        <Link to="/register" className="mt-3 inline-block text-sm text-teal-700">
          Create an account
        </Link>
      </Card>
    </main>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (user) return <Navigate to="/" replace />;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void register(String(data.get("email")), String(data.get("password"))).catch((err: Error) => setError(err.message));
  }

  return (
    <main className="mx-auto mt-16 max-w-md">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Create account</h1>
        <form className="mt-3 grid gap-3" onSubmit={onSubmit}>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password (8+ characters)">
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit">Register</Button>
        </form>
        <Link to="/login" className="mt-3 inline-block text-sm text-teal-700">
          I already have an account
        </Link>
      </Card>
    </main>
  );
}
