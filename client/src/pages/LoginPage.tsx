import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAction } from '../hooks/useAsync';
import { Button, Card, ErrorState, Input } from '../components/ui';

export function LoginPage() {
  const { player, loading, login } = useAuth();
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const entrar = useAction(login);

  // Ja logado nao tem o que fazer aqui.
  if (!loading && player) return <Navigate to="/conta" replace />;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (await entrar.run({ email: email.trim(), password: senha })) navegar('/conta');
  };

  return (
    <div className="mx-auto w-full max-w-sm py-6 sm:py-12">
      <Card title="Entrar">
        <form onSubmit={enviar} className="space-y-4">
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            autoComplete="email"
            inputMode="email"
            placeholder="voce@exemplo.com"
            required
          />

          <Input
            label="Senha"
            type="password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            autoComplete="current-password"
            required
          />

          <Button type="submit" loading={entrar.loading} className="w-full">
            <LogIn size={15} />
            Entrar
          </Button>

          {entrar.error && <ErrorState error={entrar.error} />}
        </form>
      </Card>

      <p className="mt-4 text-center text-xs text-ink-muted">
        Ainda não tem conta?{' '}
        <Link to="/criar-conta" className="font-semibold text-gold hover:underline">
          Criar a sua
        </Link>
      </p>
    </div>
  );
}
