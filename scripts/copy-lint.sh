#!/bin/bash
# scripts/copy-lint.sh — surfaces user-facing copy drift
# Run before merging UI changes. See CLAUDE.md "User-Facing Copy Rules" for the rules.
set -e

echo "── Title case violations ──"
grep -nE '[A-Z][a-z]+ [A-Z][a-z]+' index.html js/ \
  | grep -v 'class=\|id=\|//\|test\|spec' \
  | head -50 || echo "  (clean)"

echo
echo "── Please prefixes ──"
grep -rn 'Please ' js/ index.html | head -20 || echo "  (clean)"

echo
echo "── Three-dot ellipsis ──"
grep -rn '\.\.\.' js/ index.html | grep -v '//\|spread' | head -20 || echo "  (clean)"

echo
echo "── 'Are you sure' anti-pattern ──"
grep -rn 'Are you sure' js/ || echo "  (clean)"

echo
echo "── 'successfully' filler ──"
grep -rn 'successfully' js/ || echo "  (clean)"

echo
echo "── 'cannot' (should be can't) ──"
grep -rn 'cannot' js/ | grep -v '//' || echo "  (clean)"
