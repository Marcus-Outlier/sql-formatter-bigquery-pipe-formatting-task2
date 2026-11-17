import Tokenizer from '../../src/lexer/Tokenizer.js';
import { createParser } from '../../src/parser/createParser.js';
import { bigquery } from '../../src/languages/bigquery/bigquery.formatter.js';

describe('BigQuery pipe clauses', () => {
  const parse = (sql: string) =>
    createParser(new Tokenizer(bigquery.tokenizerOptions, 'bigquery')).parse(sql, {});

  it('parses pipe-specific clauses as structured nodes', () => {
    const [statement] = parse(
      'from sales |> extend amount * 2 as doubled |> set amount = doubled |> drop doubled |> as s'
    );
    expect(statement.children).toMatchObject([
      { type: 'clause', nameKw: { text: 'FROM' } },
      {
        type: 'pipe',
        children: [
          { type: 'pipe_clause', nameKw: { text: 'EXTEND' }, children: expect.any(Array) },
        ],
      },
      {
        type: 'pipe',
        children: [{ type: 'pipe_clause', nameKw: { text: 'SET' }, children: expect.any(Array) }],
      },
      {
        type: 'pipe',
        children: [{ type: 'pipe_clause', nameKw: { text: 'DROP' }, children: expect.any(Array) }],
      },
      {
        type: 'pipe',
        children: [{ type: 'pipe_clause', nameKw: { text: 'AS' }, children: expect.any(Array) }],
      },
    ]);
  });

  it('keeps GROUP BY within the AGGREGATE step and preserves standard SELECT parsing', () => {
    const [statement] = parse(
      'from sales |> aggregate sum(amount) as total group by region |> select *'
    );
    expect(statement.children).toMatchObject([
      { type: 'clause', nameKw: { text: 'FROM' } },
      {
        type: 'pipe',
        children: [
          { type: 'pipe_clause', nameKw: { text: 'AGGREGATE' } },
          { type: 'clause', nameKw: { text: 'GROUP BY' } },
        ],
      },
      {
        type: 'pipe',
        children: [
          {
            type: 'clause',
            nameKw: { text: 'SELECT' },
            children: [{ type: 'all_columns_asterisk' }],
          },
        ],
      },
    ]);
  });

  it('leaves pipe-only words as identifiers outside pipe steps', () => {
    const [statement] = parse('select aggregate, extend from sales');
    expect(statement.children[0]).toMatchObject({
      type: 'clause',
      children: [
        { type: 'identifier', text: 'aggregate' },
        { type: 'comma' },
        { type: 'identifier', text: 'extend' },
      ],
    });
  });
});

describe('Parser', () => {
  const parse = (sql: string) => {
    const tokenizer = new Tokenizer(
      {
        reservedClauses: ['FROM', 'WHERE', 'LIMIT', 'CREATE TABLE'],
        reservedSelect: ['SELECT'],
        reservedSetOperations: ['UNION', 'UNION ALL'],
        reservedJoins: ['JOIN'],
        reservedFunctionNames: ['SQRT', 'CURRENT_TIME'],
        reservedKeywords: ['BETWEEN', 'LIKE', 'ON', 'USING'],
        reservedDataTypes: [],
        operators: [':'],
        extraParens: ['[]', '{}'],
        stringTypes: ["''-qq"],
        identTypes: ['""-qq'],
      },
      'sql'
    );

    return createParser(tokenizer).parse(sql, {});
  };

  it('parses empty list of tokens', () => {
    expect(parse('')).toEqual([]);
  });

  it('throws error when parsing invalid SQL expression', () => {
    expect(() => parse('SELECT (')).toThrow('Parse error at token: «EOF»');
  });

  it('parses list of statements', () => {
    expect(parse('foo; bar')).toMatchSnapshot();
  });

  it('parses array subscript', () => {
    expect(parse('SELECT my_array[5]')).toMatchSnapshot();
  });

  it('parses array subscript with comment', () => {
    expect(parse('SELECT my_array /*haha*/ [5]')).toMatchSnapshot();
  });

  it('parses parenthesized expressions', () => {
    expect(parse('SELECT (birth_year - (CURRENT_DATE + 1))')).toMatchSnapshot();
  });

  it('parses function call', () => {
    expect(parse('SELECT sqrt(2)')).toMatchSnapshot();
  });

  it('parses LIMIT clause with count', () => {
    expect(parse('LIMIT 15;')).toMatchSnapshot();
  });

  it('parses LIMIT clause with offset and count', () => {
    expect(parse('LIMIT 100, 15;')).toMatchSnapshot();
  });

  it('parses LIMIT clause with longer expressions', () => {
    expect(parse('LIMIT 50 + 50, 3 * 2;')).toMatchSnapshot();
  });

  it('parses BETWEEN expression', () => {
    expect(parse('WHERE age BETWEEN 18 AND 63')).toMatchSnapshot();
  });

  it('parses set operations', () => {
    expect(parse('SELECT foo FROM bar UNION ALL SELECT foo FROM baz')).toMatchSnapshot();
  });

  it('parses SELECT *', () => {
    expect(parse('SELECT *')).toMatchSnapshot();
  });

  it('parses SELECT ident.*', () => {
    expect(parse('SELECT ident.*')).toMatchSnapshot();
  });

  it('parses function name with and without parameters', () => {
    expect(parse('SELECT CURRENT_TIME a, CURRENT_TIME() b;')).toMatchSnapshot();
  });

  it('parses curly braces', () => {
    expect(parse('SELECT {foo: bar};')).toMatchSnapshot();
  });

  it('parses square brackets', () => {
    expect(parse('SELECT [1, 2, 3];')).toMatchSnapshot();
  });

  it('parses qualified.identifier.sequence', () => {
    expect(parse('SELECT foo.bar.baz;')).toMatchSnapshot();
  });

  it('parses CASE expression', () => {
    expect(parse('SELECT CASE foo WHEN 1+1 THEN 10 ELSE 20 END;')).toMatchSnapshot();
  });
});
