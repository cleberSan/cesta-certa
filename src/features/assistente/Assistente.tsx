import { Fragment, useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { perguntasSugeridas } from "../../shared/assistente/gravadas";
import {
  limiteDaPergunta,
  tamanhoDaPergunta,
  type LimiteDoAssistente,
} from "../../shared/contratos/assistente";
import type { Enviar } from "../precos/nfce/cliente";
import { acessoInicial, lerCodigoDigitado, type AcessoAoAssistente } from "./acesso";
import { perguntar, type ModoDoAssistente, type RespostaNaTela } from "./cliente";
import {
  conferirResposta,
  temValorNaoConferido,
  valoresDoContexto,
  type Trecho,
} from "./conferencia";
import { montarContexto, montarPedido, type EntradaDoContexto } from "./contexto";
import {
  ajudaDaPergunta,
  ajudaDoCodigo,
  avisoDeGravada,
  avisoDeNaoConferido,
  contarCaracteres,
  descreverLimite,
  mensagemDaFalha,
  mensagemDaPerguntaLonga,
  mensagemDaPerguntaVazia,
  mensagemDoCodigo,
  mensagemDoContextoGrande,
  notaDaConferencia,
  textoDoAceite,
  type MensagemDaFalha,
} from "./textos";
import "./assistente.css";

/** O que o assistente lê do aparelho e como avisa a tela de um aceite ou código novo. */
export interface DadosDoAssistente {
  readonly acesso: AcessoAoAssistente;
  readonly onAcesso: (acesso: AcessoAoAssistente) => void;
  readonly modo: ModoDoAssistente;
  /** Troca o `fetch` nos testes. */
  readonly enviar?: Enviar;
}

type EstadoDaConversa =
  | { readonly fase: "parada" }
  | { readonly fase: "enviando" }
  | {
      readonly fase: "respondida";
      readonly resposta: RespostaNaTela;
      readonly trechos: readonly Trecho[];
    }
  | {
      readonly fase: "falhou";
      readonly mensagem: MensagemDaFalha;
      readonly traceId: string | null;
    };

const enviarPeloNavegador: Enviar = (rota, init) => fetch(rota, init);

/**
 * Assistente da compra (spec 0001, CA-26 a CA-35; ADR-0004): explica as opções que o app já
 * calculou. Antes do primeiro envio, a pessoa lê o que vai para a Anthropic e aceita (CA-28);
 * depois, digita o código de acesso uma vez por aparelho. A resposta aparece como texto, com
 * os valores em reais que não estão nos dados enviados marcados (CA-33). Na demonstração, a
 * resposta é gravada e nada sai do aparelho (CA-35).
 */
export function Assistente({
  dados,
  entrada,
}: {
  dados: DadosDoAssistente;
  entrada: EntradaDoContexto;
}) {
  const base = useId();
  const [aberto, setAberto] = useState(false);
  const [codigoRecusado, setCodigoRecusado] = useState<MensagemDaFalha | null>(null);
  const botaoDeAbrir = useRef<HTMLButtonElement>(null);
  const { acesso, modo } = dados;

  const fechar = () => {
    setAberto(false);
    queueMicrotask(() => botaoDeAbrir.current?.focus());
  };

  const etapa =
    modo === "demonstracao"
      ? "pergunta"
      : acesso.aceitoEm === null
        ? "aceite"
        : acesso.codigo === null
          ? "codigo"
          : "pergunta";

  return (
    <section className="assistente" aria-labelledby={`${base}-titulo`}>
      <h4 id={`${base}-titulo`}>Assistente</h4>
      <p className="campo-ajuda">
        Tire dúvidas sobre as opções acima. O app faz as contas; o assistente explica.
      </p>
      <button
        ref={botaoDeAbrir}
        type="button"
        className="botao botao-secundario"
        aria-expanded={aberto}
        aria-controls={`${base}-painel`}
        onClick={() => (aberto ? fechar() : setAberto(true))}
      >
        {aberto ? "Fechar o assistente" : "Perguntar ao assistente"}
      </button>
      {aberto && (
        <div id={`${base}-painel`} className="assistente-painel">
          {etapa === "aceite" && (
            <Aceite
              onAceitar={() => dados.onAcesso({ ...acesso, aceitoEm: new Date().toISOString() })}
              onRecusar={fechar}
            />
          )}
          {etapa === "codigo" && (
            <FormularioDoCodigo
              aviso={codigoRecusado}
              onCodigo={(codigo) => {
                setCodigoRecusado(null);
                dados.onAcesso({ ...acesso, codigo });
              }}
            />
          )}
          {etapa === "pergunta" && (
            <Conversa
              dados={dados}
              entrada={entrada}
              onCodigoRecusado={(mensagem) => {
                // Código recusado: sai do aparelho e a tela volta a pedir, com o motivo (CA-29).
                setCodigoRecusado(mensagem);
                dados.onAcesso({ ...acesso, codigo: null });
              }}
            />
          )}
          {modo === "servidor" && acesso.aceitoEm !== null && (
            <p className="assistente-esquecer">
              <button
                type="button"
                className="botao botao-secundario botao-pequeno"
                onClick={() => {
                  setCodigoRecusado(null);
                  dados.onAcesso(acessoInicial);
                  fechar();
                }}
              >
                Esquecer o aceite e o código neste aparelho
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Aceite({ onAceitar, onRecusar }: { onAceitar: () => void; onRecusar: () => void }) {
  const titulo = useId();
  return (
    <div className="cartao assistente-aceite" role="group" aria-labelledby={titulo}>
      <h5 id={titulo}>Antes da primeira pergunta</h5>
      {textoDoAceite.map((paragrafo) => (
        <p key={paragrafo}>{paragrafo}</p>
      ))}
      <p>
        Mais detalhes em <a href="/privacidade#assistente">Privacidade</a>.
      </p>
      <div className="acoes">
        <button type="button" className="botao" onClick={onAceitar}>
          Aceitar e continuar
        </button>
        <button type="button" className="botao botao-secundario" onClick={onRecusar}>
          Agora não
        </button>
      </div>
    </div>
  );
}

function FormularioDoCodigo({
  aviso,
  onCodigo,
}: {
  aviso: MensagemDaFalha | null;
  onCodigo: (codigo: string) => void;
}) {
  const base = useId();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  // O formulário aparece depois de um toque (aceite) ou de um código recusado: o foco vai
  // para o campo, em vez de se perder com o botão que sumiu.
  useEffect(() => {
    campo.current?.focus();
  }, []);

  const guardar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const lido = lerCodigoDigitado(texto);
    if (!lido.ok) {
      setErro(mensagemDoCodigo(lido.erro));
      campo.current?.focus();
      return;
    }
    onCodigo(lido.valor);
  };

  return (
    <form
      className="assistente-formulario"
      aria-label="Código de acesso"
      noValidate
      onSubmit={guardar}
    >
      {aviso !== null && (
        <div className="mensagem-erro assistente-aviso" role="alert">
          <p>
            <strong>{aviso.titulo}.</strong> {aviso.texto}
          </p>
        </div>
      )}
      <div className="campo">
        <label htmlFor={`${base}-codigo`}>Código de acesso</label>
        <p id={`${base}-ajuda`} className="campo-ajuda">
          {ajudaDoCodigo}
        </p>
        <input
          ref={campo}
          id={`${base}-codigo`}
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={texto}
          aria-invalid={erro !== null}
          aria-describedby={`${base}-ajuda${erro === null ? "" : ` ${base}-erro`}`}
          onChange={(evento) => {
            setTexto(evento.target.value);
            setErro(null);
          }}
        />
        {erro !== null && (
          <p id={`${base}-erro`} className="mensagem-erro">
            {erro}
          </p>
        )}
      </div>
      <button type="submit" className="botao">
        Guardar o código
      </button>
    </form>
  );
}

function Conversa({
  dados,
  entrada,
  onCodigoRecusado,
}: {
  dados: DadosDoAssistente;
  entrada: EntradaDoContexto;
  onCodigoRecusado: (mensagem: MensagemDaFalha) => void;
}) {
  const base = useId();
  const [pergunta, setPergunta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conversa, setConversa] = useState<EstadoDaConversa>({ fase: "parada" });
  const [limite, setLimite] = useState<LimiteDoAssistente | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const enviando = conversa.fase === "enviando";

  const enviar = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;
    const texto = pergunta.trim();
    if (texto === "" || tamanhoDaPergunta(texto) > limiteDaPergunta) {
      setErro(texto === "" ? mensagemDaPerguntaVazia : mensagemDaPerguntaLonga);
      campo.current?.focus();
      return;
    }
    const contexto = montarContexto(entrada);
    if (!contexto.ok) {
      setConversa({ fase: "falhou", mensagem: mensagemDoContextoGrande, traceId: null });
      return;
    }
    setConversa({ fase: "enviando" });
    const resultado = await perguntar(montarPedido(texto, contexto.valor), {
      modo: dados.modo,
      codigo: dados.acesso.codigo,
      enviar: dados.enviar ?? enviarPeloNavegador,
    });
    if (!montado.current) return;
    if (resultado.ok) {
      const trechos = conferirResposta(resultado.valor.texto, valoresDoContexto(contexto.valor));
      setConversa({ fase: "respondida", resposta: resultado.valor, trechos });
      setLimite(resultado.valor.limite);
      return;
    }
    const falha = resultado.erro;
    if (falha.code === "assistente.nao-autorizado") {
      onCodigoRecusado(mensagemDaFalha(falha));
      return;
    }
    setLimite(falha.limite);
    setConversa({ fase: "falhou", mensagem: mensagemDaFalha(falha), traceId: falha.traceId });
  };

  return (
    <>
      <form
        className="assistente-formulario"
        aria-label="Pergunta ao assistente"
        noValidate
        onSubmit={(evento) => void enviar(evento)}
      >
        <div className="campo">
          <label htmlFor={`${base}-pergunta`}>Sua pergunta</label>
          <p id={`${base}-ajuda`} className="campo-ajuda">
            {ajudaDaPergunta}
          </p>
          <textarea
            ref={campo}
            id={`${base}-pergunta`}
            rows={3}
            maxLength={limiteDaPergunta}
            value={pergunta}
            aria-invalid={erro !== null}
            aria-describedby={`${base}-ajuda ${base}-contagem${erro === null ? "" : ` ${base}-erro`}`}
            onChange={(evento) => {
              setPergunta(evento.target.value);
              setErro(null);
            }}
          />
          <p id={`${base}-contagem`} className="campo-ajuda assistente-contagem">
            {contarCaracteres(tamanhoDaPergunta(pergunta))}
          </p>
          {erro !== null && (
            <p id={`${base}-erro`} className="mensagem-erro">
              {erro}
            </p>
          )}
        </div>
        <div className="assistente-sugestoes" role="group" aria-label="Perguntas prontas">
          {perguntasSugeridas.map((sugestao) => (
            <button
              key={sugestao}
              type="button"
              className="botao botao-secundario botao-pequeno"
              onClick={() => {
                setPergunta(sugestao);
                setErro(null);
                campo.current?.focus();
              }}
            >
              {sugestao}
            </button>
          ))}
        </div>
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? "Perguntando…" : "Perguntar"}
        </button>
      </form>

      <div className="assistente-saida" aria-live="polite" aria-busy={enviando}>
        {conversa.fase === "respondida" && <Resposta conversa={conversa} />}
        {conversa.fase === "falhou" && (
          <div className="mensagem-erro" role="alert">
            <p>
              <strong>{conversa.mensagem.titulo}.</strong> {conversa.mensagem.texto}
            </p>
            {conversa.traceId !== null && (
              <p className="assistente-rastro">Código do pedido: {conversa.traceId}</p>
            )}
          </div>
        )}
        {limite !== null && <p className="campo-ajuda">{descreverLimite(limite)}</p>}
      </div>
    </>
  );
}

function Resposta({
  conversa,
}: {
  conversa: { readonly resposta: RespostaNaTela; readonly trechos: readonly Trecho[] };
}) {
  const { resposta, trechos } = conversa;
  return (
    <div className="assistente-resposta">
      <h5>Resposta</h5>
      <p className="assistente-texto">
        {trechos.map((trecho, posicao) =>
          trecho.tipo === "valor" && !trecho.conferido ? (
            <mark key={posicao} className="assistente-nao-conferido">
              {trecho.texto} <span>({avisoDeNaoConferido})</span>
            </mark>
          ) : (
            <Fragment key={posicao}>{trecho.texto}</Fragment>
          ),
        )}
      </p>
      {temValorNaoConferido(trechos) && <p className="campo-ajuda">{notaDaConferencia}</p>}
      {resposta.gravada && <p className="campo-ajuda">{avisoDeGravada}</p>}
    </div>
  );
}
