/**
 * 限制三元表达式嵌套深度。`a ? b : c` 为 1 层，`a ? b : c ? d : e` 为 2 层。
 *
 * @param {import("estree").Node | null | undefined} node
 * @returns {import("estree").Node | null | undefined}
 */
function unwrap(node) {
  let current = node;
  while (current?.type === "ParenthesizedExpression") {
    current = current.expression;
  }
  return current;
}

/**
 * @param {import("estree").Node | null | undefined} node
 * @returns {number}
 */
function ternaryDepth(node) {
  const current = unwrap(node);
  if (current?.type !== "ConditionalExpression") return 0;
  return (
    1 + Math.max(ternaryDepth(current.consequent), ternaryDepth(current.alternate))
  );
}

/**
 * @param {import("estree").Node} node
 * @returns {boolean}
 */
function isNestedInTernary(node) {
  let parent = node.parent;
  while (parent?.type === "ParenthesizedExpression") {
    parent = parent.parent;
  }
  return parent?.type === "ConditionalExpression";
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow ternary expressions nested more than N levels",
    },
    schema: [
      {
        type: "integer",
        minimum: 1,
      },
    ],
    messages: {
      tooDeep:
        "Ternary expressions cannot be nested more than {{max}} levels (found {{depth}}).",
    },
  },
  create(context) {
    const max = context.options[0] ?? 2;
    return {
      ConditionalExpression(node) {
        if (isNestedInTernary(node)) return;
        const depth = ternaryDepth(node);
        if (depth > max) {
          context.report({
            node,
            messageId: "tooDeep",
            data: { max, depth },
          });
        }
      },
    };
  },
};
