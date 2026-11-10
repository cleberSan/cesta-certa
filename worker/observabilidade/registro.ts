/**
 * Log estruturado do Worker: uma linha JSON por evento, que os logs da Cloudflare indexam por
 * campo.
 *
 * Regra do projeto (spec 0001, CA-11): o log leva só metadados técnicos, como o resultado, a
 * duração e contagens. Nunca o link da nota, o HTML, o CNPJ, o CPF ou qualquer texto que veio
 * de quem usa. Quem registra monta o evento campo a campo; não existe "logar o objeto todo".
 */
export type Evento = Readonly<Record<string, string | number | boolean | null>>;

export type Registrar = (evento: Evento) => void;

export const registrarNoConsole: Registrar = (evento) => {
  console.log(JSON.stringify(evento));
};
