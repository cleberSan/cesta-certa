import { sp } from "./sp";
import type { LeitorDeUf } from "./tipos";

/** UFs com leitor. A lista permitida de hosts e caminhos sai daqui (spec 0001, CA-12). */
export const leitores: readonly LeitorDeUf[] = [sp];
