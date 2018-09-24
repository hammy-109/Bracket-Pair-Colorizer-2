import DefinitionAfterInheritance from "./definitionAfterInheritance";
import LanguageDefinition from "./languageDefinition";
import ScopePair from "./scopePair";
import ScopeSingle, { ScopeType } from "./scopeSingle";

export class RuleBuilder {
    private readonly start = new Map<string, LanguageDefinition>();
    private readonly intermediate = new Map<string, DefinitionAfterInheritance>();
    private readonly final = new Map<string, Map<string, ScopeSingle>>();

    constructor(languageDefinitions: LanguageDefinition[]) {
        for (const userLanguage of languageDefinitions) {
            this.start.set(userLanguage.language, userLanguage);
        }
    }

    public override(languageDefinitions: LanguageDefinition[]) {
        for (const userLanguage of languageDefinitions) {
            this.start.set(userLanguage.language, userLanguage);
        }
    }

    public get(languageId: string): Map<string, ScopeSingle> | undefined {
        const stackResult = this.final.get(languageId);
        if (stackResult) {
            return stackResult;
        }

        const baseLanguage = this.start.get(languageId);

        if (!baseLanguage) {
            return;
        }

        const history = new Set<LanguageDefinition>();
        const scopesThisToBase = this.getAllScopes(baseLanguage, [], history);

        const scopeMap = new Map<string, ScopePair>();

        // Set base map first then let extended languages overwrite
        for (let i = scopesThisToBase.length; i-- > 0;) {
            for (const scope of scopesThisToBase[i]) {
                if (!scope.open) {
                    console.error("Missing 'open' property");
                    console.error(scope);
                    continue;
                }

                scopeMap.set(scope.open, scope);
            }
        }

        const extendedLanguage = new DefinitionAfterInheritance(baseLanguage.language, scopeMap);

        this.intermediate.set(extendedLanguage.language, extendedLanguage);

        const tokens = new Map<string, ScopeSingle>();
        for (const scope of scopeMap.values()) {
            if (!scope.open) {
                console.error("Missing 'open' property");
                console.error(scope);
                continue;
            }

            if (scope.open && scope.close) {
                if (scope.close === scope.open) {
                    throw new Error("Open and close scopes are the same: " + scope.open);
                }

                const open = new ScopeSingle(scope.open, ScopeType.Open, scope.open);
                tokens.set(open.tokenName, open);

                if (Array.isArray(scope.close)) {
                    for (const closeType of scope.close) {
                        const close = new ScopeSingle(closeType, ScopeType.Close, scope.open);
                        tokens.set(close.tokenName, close);
                    }
                }
                else {
                    const close = new ScopeSingle(scope.close, ScopeType.Close, scope.open);
                    tokens.set(close.tokenName, close);
                }
            }
            else {
                const ambiguous = new ScopeSingle(scope.open, ScopeType.Ambiguous, scope.open);
                tokens.set(ambiguous.tokenName, ambiguous);
            }
        }

        this.final.set(languageId, tokens);
        return tokens;
    }

    private getAllScopes(
        userLanguageDefinition: LanguageDefinition,
        allScopeDefinitions: ScopePair[][],
        history: Set<LanguageDefinition>): ScopePair[][] {
        if (history.has(userLanguageDefinition)) {
            console.error("Cycle detected while parsing user languages: " +
                userLanguageDefinition.language + " => " +
                [...history.values()]);
            return allScopeDefinitions;
        }

        history.add(userLanguageDefinition);

        if (userLanguageDefinition.scopes) {
            allScopeDefinitions.push(userLanguageDefinition.scopes);
        }

        if (userLanguageDefinition.extends) {
            const parsedLanguage = this.intermediate.get(userLanguageDefinition.extends);

            if (parsedLanguage) {
                allScopeDefinitions.push([...parsedLanguage.scopes.values()]);
                return allScopeDefinitions;
            }

            const unParsedLanguage = this.start.get(userLanguageDefinition.extends);
            if (unParsedLanguage) {
                this.getAllScopes(unParsedLanguage, allScopeDefinitions, history);
            }
            else {
                console.error("Could not find user defined language: " + userLanguageDefinition.extends);
            }
        }

        return allScopeDefinitions;
    }
}

interface ISimpleInternalBracket {
    open: string;
    close: string;
}

function getRegexForBrackets(input: ISimpleInternalBracket[]): RegExp {
    const pieces: string[] = [];
    input.forEach((b) => {
        pieces.push(b.open);
        pieces.push(b.close);
    });
    return createBracketOrRegExp(pieces);

}

function createBracketOrRegExp(pieces: string[]): RegExp {
    const regexStr = `(${pieces.map(prepareBracketForRegExp).join(")|(")})`;
    return createRegExp(regexStr, true);
}

function prepareBracketForRegExp(str: string): string {
    // This bracket pair uses letters like e.g. "begin" - "end"
    const insertWordBoundaries = (/^[\w]+$/.test(str));
    str = escapeRegExpCharacters(str);
    return (insertWordBoundaries ? `\\b${str}\\b` : str);
}

function escapeRegExpCharacters(value: string): string {
    return value.replace(/[\-\\\{\}\*\+\?\|\^\$\.\[\]\(\)\#]/g, "\\$&");
}

function createRegExp(searchString: string, isRegex: boolean, options: RegExpOptions = {}): RegExp {
    if (!searchString) {
        throw new Error("Cannot create regex from empty string");
    }
    if (!isRegex) {
        searchString = escapeRegExpCharacters(searchString);
    }
    if (options.wholeWord) {
        if (!/\B/.test(searchString.charAt(0))) {
            searchString = "\\b" + searchString;
        }
        if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
            searchString = searchString + "\\b";
        }
    }
    let modifiers = "";
    if (options.global) {
        modifiers += "g";
    }
    if (!options.matchCase) {
        modifiers += "i";
    }
    if (options.multiline) {
        modifiers += "m";
    }

    return new RegExp(searchString, modifiers);
}

export interface RegExpOptions {
    matchCase?: boolean;
    wholeWord?: boolean;
    multiline?: boolean;
    global?: boolean;
}
