import { useEffect, useId, useRef, useState, useSyncExternalStore, type SubmitEvent } from "react";
import type { ErroDoBanco } from "../../../shared/armazenamento/banco";
import { mensagemDoBanco } from "../../../shared/armazenamento/textos";
import type { NotaConsultada } from "../../../shared/contratos/nfce";
import { formatarCentavos } from "../../../shared/dinheiro";
import { recarregarAoVoltar } from "../../../shared/recarregarAoVoltar";
import { abrirPrecos, type AparelhoDosPrecos } from "../aparelho";
import {
  consultarNota,
  formatarCnpj,
  formatarEmissao,
  formatarQuantidade,
  mensagemDaFalha,
  somarItens,
  type FalhaDaConsulta,
} from "./cliente";
import { ImportacaoDaNota } from "./ImportacaoDaNota";
import { resumoDaNota } from "./importacao";
import { LeitorDeQr } from "./LeitorDeQr";
import "./consulta-nota.css";

type Estado =
  | { fase: "inicial" }
  | { fase: "consultando" }
  /** `vez` separa duas leituras seguidas: cada nota começa a importação do zero. */
  | { fase: "lida"; nota: NotaConsultada; resumo: string | null; vez: number }
  | { fase: "falhou"; falha: FalhaDaConsulta };

type Carga =
  | { fase: "abrindo" }
  | { fase: "pronta"; aparelho: AparelhoDosPrecos }
  | { fase: "falhou"; motivo: ErroDoBanco };

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
 * Leitura da nota fiscal (spec 0001, CA-10, CA-13 e CA-14): o QR Code pela câmera ou o link
 * colado, a nota consultada no servidor e os preços guardados no aparelho. Todo texto que vem
 * da nota é mostrado como texto pelo React, nunca como HTML. O link não é guardado: só o
 * resumo SHA-256 da chave de acesso, para reconhecer a mesma nota depois (CA-11).
 */
export default function ConsultaNota() {
  const [link, setLink] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "inicial" });
  const [carga, setCarga] = useState<Carga>({ fase: "abrindo" });
  // O botão só liga depois que a ilha carrega: antes disso o formulário não teria efeito.
  const pronta = useIlhaCarregada();
  const idDoCampo = useId();
  const idDaAjuda = useId();
  const consultando = estado.fase === "consultando";
  const leituras = useRef(0);

  useEffect(() => recarregarAoVoltar(globalThis), []);

  useEffect(() => {
    let ativa = true;
    void abrirPrecos(globalThis.indexedDB).then((aberto) => {
      if (!ativa) return;
      setCarga(
        aberto.ok
          ? { fase: "pronta", aparelho: aberto.valor }
          : { fase: "falhou", motivo: aberto.erro },
      );
    });
    return () => {
      ativa = false;
    };
  }, []);

  async function consultar(endereco: string) {
    if (consultando) return;
    setEstado({ fase: "consultando" });
    const resultado = await consultarNota(endereco, (rota, init) => fetch(rota, init));
    if (!resultado.ok) {
      setEstado({ fase: "falhou", falha: resultado.erro });
      return;
    }
    const resumo = await resumoDaNota(endereco).catch(() => null);
    leituras.current += 1;
    setEstado({ fase: "lida", nota: resultado.valor, resumo, vez: leituras.current });
  }

  function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    void consultar(link);
  }

  return (
    <section className="consulta" aria-label="Consultar nota fiscal">
      <LeitorDeQr
        desligado={!pronta || consultando}
        onLer={(lido) => {
          setLink(lido);
          void consultar(lido);
        }}
      />
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
      {estado.fase === "lida" && (
        <>
          <Nota nota={estado.nota} />
          {carga.fase === "abrindo" && (
            <p className="precos-carregando" role="status">
              Abrindo os dados do aparelho…
            </p>
          )}
          {carga.fase === "falhou" && (
            <p className="alerta" role="alert">
              Os preços desta nota não podem ser guardados agora. {mensagemDoBanco(carga.motivo)}
            </p>
          )}
          {carga.fase === "pronta" && (
            <ImportacaoDaNota
              key={estado.vez}
              nota={estado.nota}
              resumo={estado.resumo}
              aparelho={carga.aparelho}
              onImportar={({ observacoes, associacoes }) =>
                setCarga({
                  fase: "pronta",
                  aparelho: { ...carga.aparelho, observacoes, associacoes },
                })
              }
            />
          )}
        </>
      )}
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
        <>
          <p>Com o cupom em mãos, os preços desta compra podem ser digitados.</p>
          <p>
            <a className="botao botao-secundario" href="/precos#digitar">
              Digitar os preços desta compra
            </a>
          </p>
        </>
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
