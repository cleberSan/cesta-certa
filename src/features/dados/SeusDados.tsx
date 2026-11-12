import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { limiteDoArquivo } from "../../shared/armazenamento/arquivo";
import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { mensagemDoBanco } from "../../shared/armazenamento/textos";
import { recarregarAoVoltar } from "../../shared/recarregarAoVoltar";
import { abrirDados } from "./abertura";
import {
  conferirArquivo,
  exportar,
  importar,
  lerAparelho,
  type Aparelho,
  type ArquivoConferido,
} from "./copia";
import {
  avisoDaCopia,
  avisoDeRecusados,
  dataDaCopia,
  descreverResumo,
  limiteEmMb,
  mensagemDaExportacao,
  mensagemDaImportacao,
} from "./textos";
import "./dados.css";

type Carga =
  | { fase: "abrindo" }
  | { fase: "pronta"; banco: Banco; aparelho: Aparelho }
  | { fase: "falhou"; motivo: ErroDoBanco };

/**
 * Seus dados (spec 0001 CA-04, tarefa T05): gerar a cópia em arquivo e trazer uma cópia de
 * volta. As regras ficam em copia.ts e em shared/armazenamento/arquivo.ts; aqui é só a tela.
 * O arquivo é lido no próprio aparelho e não vai para nenhum servidor.
 */
export default function SeusDados() {
  const [carga, setCarga] = useState<Carga>({ fase: "abrindo" });

  useEffect(() => recarregarAoVoltar(globalThis), []);

  useEffect(() => {
    let ativa = true;
    void abrirDados(globalThis.indexedDB).then((aberto) => {
      if (!ativa) return;
      setCarga(
        aberto.ok ? { fase: "pronta", ...aberto.valor } : { fase: "falhou", motivo: aberto.erro },
      );
    });
    return () => {
      ativa = false;
    };
  }, []);

  if (carga.fase === "abrindo") {
    return (
      <p className="dados-abrindo" role="status">
        Abrindo os seus dados…
      </p>
    );
  }
  if (carga.fase === "falhou") {
    return (
      <div className="alerta" role="alert">
        <p>
          <strong>Os dados não abriram.</strong> {mensagemDoBanco(carga.motivo)}
        </p>
        {carga.motivo === "indisponivel" ? (
          <p>Sem armazenamento no navegador, não há o que exportar nem onde importar.</p>
        ) : (
          <p>
            <button type="button" className="botao" onClick={() => globalThis.location.reload()}>
              Recarregar a página
            </button>
          </p>
        )}
      </div>
    );
  }
  return <Painel banco={carga.banco} inicial={carga.aparelho} />;
}

interface Escolhido {
  readonly nome: string;
  readonly conferido: ArquivoConferido;
}

function Painel({ banco, inicial }: { banco: Banco; inicial: Aparelho }) {
  const base = useId();
  const id = (parte: string) => `${base}-${parte}`;

  const [aparelho, setAparelho] = useState(inicial);
  const [exportacao, setExportacao] = useState<{ aviso?: string; erro?: string }>({});
  const [importacao, setImportacao] = useState<{ aviso?: string; erro?: string }>({});
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [importado, setImportado] = useState(false);
  // Pedido de foco: um objeto novo a cada vez, para focar de novo o mesmo elemento.
  const [foco, setFoco] = useState<{ parte: string } | null>(null);
  // Uma ação por vez: o segundo toque enquanto a primeira grava não faz nada.
  const ocupado = useRef(false);
  // Só a leitura mais recente vale, se a pessoa trocar de arquivo enquanto outro é lido.
  const leitura = useRef(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (foco !== null) document.getElementById(`${base}-${foco.parte}`)?.focus();
  }, [base, foco]);

  const limparArquivo = () => {
    leitura.current += 1;
    setEscolhido(null);
    if (campo.current !== null) campo.current.value = "";
  };

  const aoExportar = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      const copia = await exportar(banco, new Date());
      if (!copia.ok) {
        setExportacao({ erro: mensagemDaExportacao(copia.erro) });
        return;
      }
      baixar(copia.valor.nome, copia.valor.texto);
      setAparelho((atual) => ({
        ...atual,
        resumo: copia.valor.resumo,
        recusados: copia.valor.recusados,
      }));
      setExportacao({ aviso: avisoDaCopia(copia.valor) });
    } finally {
      ocupado.current = false;
    }
  };

  const aoEscolher = async (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    const vez = (leitura.current += 1);
    setEscolhido(null);
    setImportado(false);
    setImportacao({});
    if (arquivo === undefined) return;

    // O tamanho é conferido antes de ler: um arquivo enorme nem chega à memória.
    if (arquivo.size > limiteDoArquivo) {
      setImportacao({ erro: mensagemDaImportacao({ tipo: "arquivo.grande-demais" }) });
      return;
    }
    let texto: string;
    try {
      texto = await arquivo.text();
    } catch {
      if (vez === leitura.current) {
        setImportacao({ erro: mensagemDaImportacao({ tipo: "arquivo.ilegivel" }) });
      }
      return;
    }
    const conferido = conferirArquivo(texto);
    // O que está no aparelho agora, para a pergunta dizer o que será substituído.
    const atual = await lerAparelho(banco);
    if (vez !== leitura.current) return;
    if (!conferido.ok) {
      setImportacao({ erro: mensagemDaImportacao(conferido.erro) });
      return;
    }
    if (!atual.ok) {
      setImportacao({ erro: mensagemDaImportacao(atual.erro) });
      return;
    }
    setAparelho(atual.valor);
    setEscolhido({ nome: arquivo.name, conferido: conferido.valor });
    setImportacao({ aviso: "Arquivo conferido. Confirme abaixo para substituir os dados." });
  };

  const aoImportar = async () => {
    if (escolhido === null || ocupado.current) return;
    ocupado.current = true;
    try {
      const gravado = await importar(banco, escolhido.conferido);
      if (!gravado.ok) {
        setImportacao({ erro: mensagemDaImportacao(gravado.erro) });
        return;
      }
      setAparelho({ estado: escolhido.conferido.estado, resumo: gravado.valor, recusados: 0 });
      limparArquivo();
      setExportacao({});
      setImportacao({ aviso: `Dados importados: ${descreverResumo(gravado.valor)}.` });
      setImportado(true);
      setFoco({ parte: "abrir-lista" });
    } finally {
      ocupado.current = false;
    }
  };

  const aoCancelar = () => {
    limparArquivo();
    setImportacao({});
    setFoco({ parte: "arquivo" });
  };

  const descricoes = [id("ajuda"), importacao.erro === undefined ? null : id("erro-importar")]
    .filter((parte) => parte !== null)
    .join(" ");

  return (
    <section className="dados" aria-label="Cópia dos dados">
      <h2>Exportar uma cópia</h2>
      <p>
        Neste aparelho: <strong>{descreverResumo(aparelho.resumo)}</strong>.
      </p>
      {aparelho.recusados > 0 && <p className="alerta">{avisoDeRecusados(aparelho.recusados)}</p>}
      <div className="acoes">
        <button type="button" className="botao" onClick={() => void aoExportar()}>
          Exportar cópia
        </button>
      </div>
      <div className="dados-aviso" role="status">
        {exportacao.aviso !== undefined && <p>{exportacao.aviso}</p>}
      </div>
      {exportacao.erro !== undefined && (
        <p className="mensagem-erro" role="alert">
          {exportacao.erro}
        </p>
      )}

      <h2>Importar uma cópia</h2>
      <div className="campo">
        <label htmlFor={id("arquivo")}>Arquivo da cópia</label>
        <input
          ref={campo}
          id={id("arquivo")}
          type="file"
          accept=".json,application/json"
          aria-invalid={importacao.erro !== undefined}
          aria-describedby={descricoes}
          onChange={(evento) => void aoEscolher(evento)}
        />
      </div>
      <p id={id("ajuda")} className="dados-ajuda">
        Arquivo .json gerado pelo Cesta Certa, de até {limiteEmMb} MB. Importar substitui tudo o que
        está guardado neste aparelho.
      </p>
      <div className="dados-aviso" role="status">
        {importacao.aviso !== undefined && <p>{importacao.aviso}</p>}
        {importado && (
          <a id={id("abrir-lista")} className="botao botao-secundario botao-pequeno" href="/lista">
            Abrir a lista
          </a>
        )}
      </div>
      {importacao.erro !== undefined && (
        <p id={id("erro-importar")} className="mensagem-erro" role="alert">
          {importacao.erro}
        </p>
      )}

      {escolhido !== null && (
        <div className="confirmacao" role="group" aria-labelledby={id("pergunta")}>
          <p id={id("pergunta")}>
            O arquivo <strong>{escolhido.nome}</strong> tem{" "}
            {descreverResumo(escolhido.conferido.resumo)}, de uma cópia feita em{" "}
            {dataDaCopia(escolhido.conferido.exportadoEm)}. Importar apaga o que está neste aparelho
            ({descreverResumo(aparelho.resumo)}) e põe no lugar o que está no arquivo. Não dá para
            desfazer.
          </p>
          <div className="acoes">
            <button type="button" className="botao botao-perigo" onClick={() => void aoImportar()}>
              Substituir pelos dados do arquivo
            </button>
            <button type="button" className="botao botao-secundario" onClick={aoCancelar}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Entrega o texto como um arquivo baixado, sem passar por servidor. */
function baixar(nome: string, texto: string) {
  const endereco = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = endereco;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  // O navegador ainda lê o endereço depois do clique; soltar na hora cancela o download em alguns.
  setTimeout(() => URL.revokeObjectURL(endereco), 60_000);
}
