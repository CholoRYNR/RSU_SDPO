#!/bin/bash
set -e

# ---------- CLIENT ----------
mkdir -p client/assets/images client/assets/icons client/assets/fonts

mkdir -p client/css/base client/css/components
touch client/css/base/variables.css client/css/base/reset.css client/css/base/typography.css
touch client/css/components/cards.css client/css/components/tables.css client/css/components/modals.css client/css/components/forms.css client/css/components/charts.css
touch client/css/main.css

mkdir -p client/js/auth client/js/dashboard client/js/inventory client/js/equipment client/js/borrowing client/js/return client/js/qr client/js/notifications client/js/reports client/js/users client/js/borrowers client/js/settings client/js/shared
touch client/js/auth/login.js client/js/auth/register.js
touch client/js/dashboard/dashboard.js
touch client/js/inventory/inventory.js
touch client/js/equipment/equipment.js
touch client/js/borrowing/borrower-slip.js client/js/borrowing/my-requests.js
touch client/js/return/return.js
touch client/js/qr/qr-scanner.js client/js/qr/qr-generator.js
touch client/js/notifications/notifications.js
touch client/js/reports/reports.js
touch client/js/users/users.js
touch client/js/borrowers/borrowers.js
touch client/js/settings/settings.js
touch client/js/shared/api.js client/js/shared/validators.js client/js/shared/helpers.js client/js/shared/constants.js

mkdir -p client/components/shared client/components/cards client/components/tables client/components/modals client/components/forms client/components/charts
touch client/components/shared/navbar.html client/components/shared/sidebar.html client/components/shared/footer.html client/components/shared/notification-bell.html
touch client/components/cards/equipment-card.html client/components/cards/summary-card.html client/components/cards/transaction-card.html
touch client/components/tables/inventory-table.html client/components/tables/transaction-table.html client/components/tables/audit-log-table.html
touch client/components/modals/add-equipment-modal.html client/components/modals/review-request-modal.html client/components/modals/damage-loss-modal.html client/components/modals/qr-preview-modal.html
touch client/components/forms/borrower-slip-form.html client/components/forms/equipment-form.html client/components/forms/login-form.html
touch client/components/charts/usage-trend-chart.html client/components/charts/category-distribution-chart.html

mkdir -p client/layouts
touch client/layouts/admin-layout.html client/layouts/user-layout.html client/layouts/auth-layout.html

mkdir -p client/pages/auth client/pages/admin client/pages/user
touch client/pages/auth/login.html client/pages/auth/register.html
touch client/pages/admin/dashboard.html client/pages/admin/inventory-management.html client/pages/admin/qr-management.html client/pages/admin/transaction-management.html client/pages/admin/damage-loss-management.html client/pages/admin/reports-analytics.html client/pages/admin/audit-logs.html
touch client/pages/user/equipment-showroom.html client/pages/user/borrower-slip-guidelines.html client/pages/user/borrower-slip-form.html client/pages/user/borrower-slip-attachments.html client/pages/user/my-requests.html client/pages/user/history.html client/pages/user/notifications.html

touch client/index.html

# ---------- SERVER ----------
mkdir -p server/config
touch server/config/database.js server/config/passport.js server/config/supabase.js server/config/semaphore.js server/config/mailer.js

mkdir -p server/controllers
touch server/controllers/auth.controller.js server/controllers/user.controller.js server/controllers/borrower.controller.js server/controllers/inventory.controller.js server/controllers/equipment.controller.js server/controllers/category.controller.js server/controllers/qr.controller.js server/controllers/borrow.controller.js server/controllers/return.controller.js server/controllers/damageLoss.controller.js server/controllers/notification.controller.js server/controllers/report.controller.js server/controllers/dashboard.controller.js server/controllers/auditLog.controller.js

mkdir -p server/models
touch server/models/User.js server/models/Borrower.js server/models/Equipment.js server/models/Item.js server/models/Category.js server/models/Transaction.js server/models/TransactionDetail.js server/models/TransactionLog.js server/models/DamageLossRecord.js server/models/Notification.js server/models/AuditLog.js

mkdir -p server/routes
touch server/routes/auth.routes.js server/routes/user.routes.js server/routes/borrower.routes.js server/routes/inventory.routes.js server/routes/equipment.routes.js server/routes/category.routes.js server/routes/qr.routes.js server/routes/borrow.routes.js server/routes/return.routes.js server/routes/damageLoss.routes.js server/routes/notification.routes.js server/routes/report.routes.js server/routes/dashboard.routes.js server/routes/auditLog.routes.js server/routes/index.js

mkdir -p server/middlewares
touch server/middlewares/authMiddleware.js server/middlewares/roleMiddleware.js server/middlewares/errorHandler.js server/middlewares/uploadMiddleware.js server/middlewares/csrfMiddleware.js server/middlewares/requestLogger.js

mkdir -p server/services/notificationService
touch server/services/authService.js server/services/inventoryService.js server/services/qrService.js server/services/transactionService.js server/services/damageLossService.js server/services/reportService.js
touch server/services/notificationService/smsService.js server/services/notificationService/emailService.js server/services/notificationService/inAppService.js

mkdir -p server/repositories
touch server/repositories/userRepository.js server/repositories/equipmentRepository.js server/repositories/itemRepository.js server/repositories/transactionRepository.js server/repositories/notificationRepository.js

mkdir -p server/validators
touch server/validators/auth.validator.js server/validators/equipment.validator.js server/validators/borrow.validator.js server/validators/return.validator.js server/validators/damageLoss.validator.js

mkdir -p server/helpers
touch server/helpers/responseHelper.js server/helpers/dateHelper.js server/helpers/fileHelper.js

mkdir -p server/utils
touch server/utils/generateToken.js server/utils/generateItemCode.js server/utils/hashPassword.js server/utils/logger.js

mkdir -p server/constants
touch server/constants/roles.js server/constants/transactionStatus.js server/constants/notificationTypes.js server/constants/borrowerCategories.js

mkdir -p server/database/migrations server/database/seeders
touch server/database/migrations/001_create_users_table.js server/database/migrations/002_create_borrowers_table.js server/database/migrations/003_create_categories_table.js server/database/migrations/004_create_equipment_table.js server/database/migrations/005_create_items_table.js server/database/migrations/006_create_transactions_table.js server/database/migrations/007_create_transaction_details_table.js server/database/migrations/008_create_transaction_logs_table.js server/database/migrations/009_create_damage_loss_records_table.js server/database/migrations/010_create_notifications_table.js
touch server/database/seeders/001_seed_categories.js server/database/seeders/002_seed_equipment.js server/database/seeders/003_seed_admin_accounts.js
touch server/database/connection.js

mkdir -p server/uploads/valid_ids server/uploads/authorization_documents server/uploads/qr_codes
touch server/uploads/valid_ids/.gitkeep server/uploads/authorization_documents/.gitkeep server/uploads/qr_codes/.gitkeep

mkdir -p server/reports/templates server/reports/generated
touch server/reports/templates/borrowingReportTemplate.js server/reports/templates/overdueReportTemplate.js server/reports/templates/utilizationReportTemplate.js server/reports/templates/transactionHistoryTemplate.js server/reports/templates/equipmentConditionTemplate.js
touch server/reports/generated/.gitkeep

mkdir -p server/logs
touch server/logs/app.log server/logs/error.log

mkdir -p server/tests/unit server/tests/integration server/tests/fixtures
touch server/tests/unit/.gitkeep server/tests/integration/.gitkeep server/tests/fixtures/.gitkeep

mkdir -p server/docs
touch server/docs/api-documentation.md server/docs/database-schema.md

mkdir -p server/scripts
touch server/scripts/seedDatabase.js server/scripts/resetDatabase.js

touch server/app.js

# ---------- ROOT FILES ----------
touch .env.example .gitignore nodemon.json package.json package-lock.json README.md

echo "Structure created."
