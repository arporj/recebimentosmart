-- Migration to delete any financial transaction that does not have an account_id
-- As requested by user, this deletes all orphaned transactions without a source account.

DELETE FROM financial_transactions
WHERE account_id IS NULL;
