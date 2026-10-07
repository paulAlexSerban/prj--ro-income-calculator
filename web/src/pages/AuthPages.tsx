import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button, Card, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="mx-auto mt-16 max-w-md">
      <Card className="grid gap-3 p-6">
        <h1 className="text-xl font-semibold">Offer Compare RO</h1>
        <p className="text-sm text-zinc-500">Email login. Your offers stay private to this account.</p>
        <Field label="Email">
          <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </Field>
        <Field label="Password">
          <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button
          onClick={() =>
            void login(email, password).catch((err: Error) => setError(err.message))
          }
        >
          Log in
        </Button>
        <Link to="/register" className="text-sm text-teal-700">
          Create an account
        </Link>
      </Card>
    </div>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="mx-auto mt-16 max-w-md">
      <Card className="grid gap-3 p-6">
        <h1 className="text-xl font-semibold">Create account</h1>
        <Field label="Email">
          <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </Field>
        <Field label="Password (8+ characters)">
          <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button onClick={() => void register(email, password).catch((err: Error) => setError(err.message))}>
          Register
        </Button>
        <Link to="/login" className="text-sm text-teal-700">
          I already have an account
        </Link>
      </Card>
    </div>
  );
}
