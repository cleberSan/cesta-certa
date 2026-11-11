import { useId, useState, useSyncExternalStore, type SubmitEvent } from "react";
import type { NotaConsultada } from "../../../shared/contratos/nfce";
import { formatarCentavos } from "../../../shared/dinheiro";
import {
  consultarNota,
  formatarCnpj,
  formatarEmissao,
  formatarQuantidade,
  mensagemDaFalha,
  somarItens,
  type FalhaDaConsulta,
} from "./cliente";
import "./consulta-nota.css";

type Estado =
  | { fase: "inicial" }
  | { fase: "consultando" }
  | { fase: "lida"; nota: NotaConsultada }
  | { fase: "falhou"; falha: FalhaDaConsulta };

const semAssinatura = () => () => undefined;

/**
 * Falso no HTML gerado no build e verdadeiro depois que a ilha carrega no navegador, sem
 * efeito nem estado: o React troca o valor sozinho ao hidratar.
 */
function useIlhaCarregada(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  );
}

/**
 * Tela de teste da leitura da nota fiscal (spec 0001, tarefa T03). Todo texto que vem da
 * nota é mostrado como texto pelo React, nunca como HTML.
 */
export default function ConsultaNota() {
  const [link, setLink] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "inicial" });
  // O botão só liga depois que a ilha carrega: antes disso o formulário não teria efeito.
  const pronta = useIlhaCarregada();
  const idDoCampo = useId();
  const idDaAjuda = useId();
  const consultando = estado.fase === "consultando";

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (consultando) return;
    setEstado({ fase: "consultando" });
    const resultado = await consultarNota(link, (rota, init) => fetch(rota, init));
    setEstado(
      resultado.ok
        ? { fase: "lida", nota: resultado.valor }
        : { fase: "falhou", falha: resultado.erro },
    );
  }

  return (
    <section className="consulta" aria-label="Consultar nota fiscal">
      <form className="consulta-formulario" onSubmit={enviar} noValidate>
        <label htmlFor={idDoCampo}>Link do QR Code da nota</label>
        <textarea
          id={idDoCampo}
          name="link"
          rows={3}
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={4000}
          aria-describedby={idDaAjuda}
          placeholder="https://www.nfce.fazenda.sp.gov.br/..."
          value={link}
          onChange={(evento) => setLink(evento.target.value)}
        />
        <p id={idDaAjuda} className="consulta-ajuda">
          Começa com https://www.nfce.fazenda.sp.gov.br e termina com uma sequência longa de letras
          e números.
        </p>
        <div className="consulta-acoes">
          <button type="submit" className="botao" disabled={!pronta || consultando}>
            {consultando ? "Consultando…" : "Ler nota"}
          </button>
          <button
            type="button"
            className="botao botao-secundario"
            disabled={!pronta || consultando}
            onClick={() => {
              setLink("");
              setEstado({ fase: "inicial" });
            }}
          >
            Limpar
          </button>
        </div>
      </form>

      <p className="somente-leitor" role="status">
        {estado.fase === "consultando" && "Consultando a nota na Secretaria da Fazenda."}
        {estado.fase === "lida" && `Nota lida: ${estado.nota.itens.length} itens.`}
      </p>

      {estado.fase === "falhou" && <Falha falha={estado.falha} />}
      {estado.fase === "lida" && <Nota nota={estado.nota} />}
    </section>
  );
}

function Falha({ falha }: { falha: FalhaDaConsulta }) {
  const mensagem = mensagemDaFalha(falha.code);
  return (
    <div className="consulta-falha" role="alert">
      <h2>{mensagem.titulo}</h2>
      <p>{mensagem.texto}</p>
      {mensagem.ofereceDigitar && (
        <p>
          Enquanto isso, guarde o cupom: os preços desta compra poderão ser digitados quando essa
          parte do app chegar.
        </p>
      )}
      <p className="consulta-codigo">
        Código do erro: <code>{falha.code}</code>
        {falha.traceId !== null && (
          <>
            {" "}
            · Consulta: <code>{falha.traceId}</code>
          </>
        )}
      </p>
      {falha.diagnostico !== undefined && (
        <details>
          <summary>Diagnóstico técnico (sem conteúdo da nota)</summary>
          <pre>{JSON.stringify(falha.diagnostico, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function Nota({ nota }: { nota: NotaConsultada }) {
  const emissao = formatarEmissao(nota.emitidaEm);
  return (
    <div className="consulta-nota">
      <h2>{nota.mercado.nome ?? "Mercado sem nome na nota"}</h2>
      <dl>
        <div>
          <dt>CNPJ</dt>
          <dd>{formatarCnpj(nota.mercado.cnpj)}</dd>
        </div>
        {nota.mercado.endereco !== null && (
          <div>
            <dt>Endereço</dt>
            <dd>{nota.mercado.endereco}</dd>
          </div>
        )}
        <div>
          <dt>Emissão</dt>
          <dd>{emissao ?? "Não encontrada na página"}</dd>
        </div>
        <div>
          <dt>Itens</dt>
          <dd>
            {nota.itens.length} lidos, somando {formatarCentavos(somarItens(nota))}
          </dd>
        </div>
      </dl>
      {nota.itensNaoLidos > 0 && (
        <p className="consulta-aviso">
          {nota.itensNaoLidos === 1
            ? "1 item da nota não pôde ser lido e ficou de fora."
            : `${nota.itensNaoLidos} itens da nota não puderam ser lidos e ficaram de fora.`}
        </p>
      )}
      {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- área com rolagem horizontal precisa de foco pelo teclado */}
      <div className="consulta-tabela" role="region" aria-label="Itens da nota" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Produto</th>
              <th scope="col" className="numero so-tela-larga">
                Qtde.
              </th>
              <th scope="col" className="so-tela-larga">
                Un.
              </th>
              <th scope="col" className="numero so-tela-larga">
                Preço unit.
              </th>
              <th scope="col" className="numero">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {nota.itens.map((item, indice) => (
              <tr key={indice}>
                <th scope="row">
                  {item.descricao}
                  <span className="consulta-codigo-do-item">Código {item.codigo}</span>
                  {/* No celular a conta do item fica aqui, no lugar das três colunas do meio. */}
                  <span className="consulta-conta-do-item">
                    {formatarQuantidade(item.quantidade)} {item.unidade} ×{" "}
                    {formatarCentavos(item.precoUnitarioCentavos)}
                  </span>
                </th>
                <td className="numero so-tela-larga">{formatarQuantidade(item.quantidade)}</td>
                <td className="so-tela-larga">{item.unidade}</td>
                <td className="numero so-tela-larga">
                  {formatarCentavos(item.precoUnitarioCentavos)}
                </td>
                <td className="numero">{formatarCentavos(item.totalCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
