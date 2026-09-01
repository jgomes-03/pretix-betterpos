import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApi } from './api';
import type {
	AuditRow,
	BetterPOSConfig,
	CartLine,
	CatalogItem,
	Register,
	ReportSummary,
	Session,
	TableRow,
	Transaction,
} from './types';

interface AppProps {
	config: BetterPOSConfig;
}

type UILang = 'pt' | 'en';

const uiText: Record<UILang, Record<string, string>> = {
	pt: {
		brandTitle: 'BetterPOS',
		brandSubtitle: 'Cashless e ponto de venda',
		navPos: 'Frente de Caixa',
		navAdmin: 'Gestao',
		langToggle: 'EN',
		loading: 'a carregar...',
		paymentPending: 'pagamento pendente',
		registerLabel: 'Caixa',
		registerNone: 'Nenhuma selecionada',
		selectRegister: 'Selecionar caixa',
		openSession: 'Abrir sessao',
		closeSession: 'Fechar sessao',
		openingFloatPrompt: 'Fundo de abertura',
		countedCashPrompt: 'Valor contado em caixa',
		catalog: 'Catalogo',
		add: 'Adicionar',
		cart: 'Carrinho',
		emptyCart: 'O carrinho esta vazio',
		totalToPay: 'Total a pagar',
		payCash: 'Pagar em Dinheiro',
		payEuPago: 'Pagar com EuPago',
		clearCart: 'Limpar Carrinho',
		openSessionToSell: 'Abra uma sessao para comecar a vender.',
		phonePrompt: 'Numero de telefone (ex: 9XXXXXXXX)',
		phoneRequired: 'Numero de telefone e obrigatorio.',
		eupagoStarted: 'EuPago iniciado (pagamento #%id%). Aguarde confirmacao para continuar.',
		eupagoConfirmed: 'Pagamento EuPago confirmado e marcado como pago.',
		eupagoEndedState: 'Pagamento EuPago terminou com estado: %state%.',
		cashSuccess: 'Pagamento em dinheiro concluido com sucesso.',
		timeoutHint: 'Se o estado ficar pendente por mais de 5 minutos, a venda e cancelada automaticamente.',
		admin: 'Gestao',
		dashboard: 'Painel',
		registers: 'Caixas',
		sessions: 'Sessoes',
		transactions: 'Transacoes',
		audit: 'Auditoria',
		reports: 'Relatorios',
		create: 'Criar',
		save: 'Guardar',
		cancel: 'Cancelar',
		name: 'Nome',
		code: 'Codigo',
		actions: 'Acoes',
		edit: 'Editar',
		deactivate: 'Desativar',
		disableRegisterConfirm: 'Desativar caixa %name%?',
		renameRegisterPrompt: 'Nome da caixa',
		unknownRoute: 'Rota de gestao desconhecida',
		accessDenied: 'Acesso negado',
		accessDeniedBody: 'Nao tem permissao para aceder a area de gestao.',
		salesToday: 'Vendas de hoje',
		openSessions: 'Sessoes abertas',
		recentTransactions: 'Transacoes recentes',
		activeRegistersNow: 'Caixas ativas neste momento',
		latestLoaded: 'Ultimas 200 carregadas',
		totalTransactions: 'transacoes',
		periodDays: 'Periodo (dias)',
		totalSales: 'Total de vendas',
		transactionsCount: 'Transacoes',
		loadingDots: 'A carregar...',
		search: 'Pesquisar',
		searchPlaceholder: 'Pesquisar em %title%',
		compact: 'Compacto',
		comfortable: 'Confortavel',
		results: '%count% resultados',
		noResults: 'Sem resultados para o filtro atual.',
		status: 'Estado',
		order: 'Pedido',
		amount: 'Valor',
		channel: 'Canal',
		operator: 'Operador',
		created: 'Criado',
		opened: 'Abertura',
		difference: 'Diferenca',
		actor: 'Ator',
		action: 'Acao',
		register: 'Caixa',
		active: 'Ativo',
		inactive: 'Inativo',
		statePaid: 'Pago',
		statePending: 'Pendente',
		stateFailed: 'Falhou',
		stateExpired: 'Expirado',
		stateCancelled: 'Cancelado',
		stateOpen: 'Aberto',
		stateClosed: 'Fechado',
		stateRefund: 'Reembolso',
	},
	en: {
		brandTitle: 'BetterPOS',
		brandSubtitle: 'Cashless and point of sale',
		navPos: 'Checkout',
		navAdmin: 'Management',
		langToggle: 'PT',
		loading: 'loading...',
		paymentPending: 'payment pending',
		registerLabel: 'Register',
		registerNone: 'None selected',
		selectRegister: 'Select register',
		openSession: 'Open session',
		closeSession: 'Close session',
		openingFloatPrompt: 'Opening float',
		countedCashPrompt: 'Counted cash amount',
		catalog: 'Catalog',
		add: 'Add',
		cart: 'Cart',
		emptyCart: 'Your cart is empty',
		totalToPay: 'Total to pay',
		payCash: 'Pay with Cash',
		payEuPago: 'Pay with EuPago',
		clearCart: 'Clear Cart',
		openSessionToSell: 'Open a session to start selling.',
		phonePrompt: 'Phone number (example: 9XXXXXXXX)',
		phoneRequired: 'Phone number is required.',
		eupagoStarted: 'EuPago started (payment #%id%). Wait for confirmation to continue.',
		eupagoConfirmed: 'EuPago payment confirmed and marked as paid.',
		eupagoEndedState: 'EuPago payment ended with state: %state%.',
		cashSuccess: 'Cash payment completed successfully.',
		timeoutHint: 'If status stays pending for more than 5 minutes, the sale is canceled automatically.',
		admin: 'Management',
		dashboard: 'Dashboard',
		registers: 'Registers',
		sessions: 'Sessions',
		transactions: 'Transactions',
		audit: 'Audit',
		reports: 'Reports',
		create: 'Create',
		save: 'Save',
		cancel: 'Cancel',
		name: 'Name',
		code: 'Code',
		actions: 'Actions',
		edit: 'Edit',
		deactivate: 'Deactivate',
		disableRegisterConfirm: 'Deactivate register %name%?',
		renameRegisterPrompt: 'Register name',
		unknownRoute: 'Unknown management route',
		accessDenied: 'Access denied',
		accessDeniedBody: 'You do not have permission to access management.',
		salesToday: 'Sales today',
		openSessions: 'Open sessions',
		recentTransactions: 'Recent transactions',
		activeRegistersNow: 'Active registers at this moment',
		latestLoaded: 'Latest 200 loaded',
		totalTransactions: 'transactions',
		periodDays: 'Period (days)',
		totalSales: 'Total sales',
		transactionsCount: 'Transactions',
		loadingDots: 'Loading...',
		search: 'Search',
		searchPlaceholder: 'Search in %title%',
		compact: 'Compact',
		comfortable: 'Comfortable',
		results: '%count% results',
		noResults: 'No results for the current filter.',
		status: 'Status',
		order: 'Order',
		amount: 'Amount',
		channel: 'Channel',
		operator: 'Operator',
		created: 'Created',
		opened: 'Opened',
		difference: 'Difference',
		actor: 'Actor',
		action: 'Action',
		register: 'Register',
		active: 'Active',
		inactive: 'Inactive',
		statePaid: 'Paid',
		statePending: 'Pending',
		stateFailed: 'Failed',
		stateExpired: 'Expired',
		stateCancelled: 'Canceled',
		stateOpen: 'Open',
		stateClosed: 'Closed',
		stateRefund: 'Refund',
	},
};

function initialLang(): UILang {
	if (typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('pt')) {
		return 'pt';
	}
	return 'en';
}

function toMoney(value: number | string): string {
	const n = Number(value);
	if (Number.isNaN(n)) return '0.00';
	return n.toFixed(2);
}

function looksLikeDate(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}T/.test(value) || /^\d{4}-\d{2}-\d{2}/.test(value);
}

function formatDateValue(value: string): string {
	const dt = new Date(value);
	if (Number.isNaN(dt.getTime())) return value;
	return dt.toLocaleString();
}

function applyBrandColors(config: BetterPOSConfig): void {
	if (typeof document === 'undefined') return;
	const rootStyle = document.documentElement.style;
	const primary = (config.brandPrimaryColor || '').trim();
	const secondary = (config.brandSecondaryColor || '').trim();
	if (primary) {
		rootStyle.setProperty('--color-primary', primary);
		rootStyle.setProperty('--pos-brand', primary);
		rootStyle.setProperty('--pos-brand-2', primary);
	}
	if (secondary) {
		rootStyle.setProperty('--color-secondary', secondary);
		rootStyle.setProperty('--pos-accent', secondary);
		rootStyle.setProperty('--pos-accent-2', secondary);
	}
}

function stateBadgeClass(rawValue: string): string {
	const v = rawValue.toLowerCase();
	if (v.includes('paid')) return 'status-badge status-paid';
	if (v.includes('pending')) return 'status-badge status-pending';
	if (v.includes('failed')) return 'status-badge status-failed';
	if (v.includes('expired')) return 'status-badge status-expired';
	if (v.includes('cancel')) return 'status-badge status-cancelled';
	if (v.includes('refund')) return 'status-badge status-pending';
	if (v.includes('open') || v.includes('active')) return 'status-badge status-paid';
	if (v.includes('closed') || v.includes('inactive')) return 'status-badge status-failed';
	return 'status-badge';
}

function translateStateLabel(rawValue: string, t: (key: string) => string): string {
	const v = rawValue.toLowerCase();
	if (v.includes('paid')) return t('statePaid');
	if (v.includes('pending')) return t('statePending');
	if (v.includes('failed')) return t('stateFailed');
	if (v.includes('expired')) return t('stateExpired');
	if (v.includes('cancel')) return t('stateCancelled');
	if (v.includes('refund')) return t('stateRefund');
	if (v.includes('open')) return t('stateOpen');
	if (v.includes('closed')) return t('stateClosed');
	if (v.includes('active')) return t('active');
	if (v.includes('inactive')) return t('inactive');
	return rawValue;
}

function pathFromLocation(basePath: string): string {
	const base = basePath.replace(/\/$/, '');
	const current = window.location.pathname;
	if (!base || current === base || current === `${base}/`) return '/pos';
	if (current.indexOf(`${base}/`) === 0) {
		const sub = current.slice(base.length);
		return sub || '/pos';
	}
	return '/pos';
}

function useAppRoute(basePath: string): [string, (route: string) => void] {
	const [route, setRoute] = useState<string>(pathFromLocation(basePath));

	useEffect(() => {
		function onPop() {
			setRoute(pathFromLocation(basePath));
		}
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	}, [basePath]);

	function navigate(nextRoute: string) {
		const normalized = nextRoute.startsWith('/') ? nextRoute : `/${nextRoute}`;
		window.history.pushState({}, '', `${basePath}${normalized}`);
		setRoute(normalized);
	}

	return [route, navigate];
}

function Banner({ error }: { error: string }) {
	if (!error) return null;
	return <div className="error-box">{error}</div>;
}

function Modal({
	open,
	title,
	children,
	onClose,
}: {
	open: boolean;
	title: string;
	children: ReactNode;
	onClose: () => void;
}) {
	if (!open) return null;
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-card" onClick={(ev) => ev.stopPropagation()}>
				<div className="modal-header">
					<h4>{title}</h4>
					<button type="button" className="btn-secondary modal-close-btn" onClick={onClose}>
						x
					</button>
				</div>
				<div className="modal-body">{children}</div>
			</div>
		</div>
	);
}

function AppHeader({
	canAdmin,
	navigate,
	route,
	t,
	brandTitle,
	brandSubtitle,
	brandLogoUrl,
	onToggleLang,
}: {
	canAdmin: boolean;
	navigate: (route: string) => void;
	route: string;
	t: (key: string, vars?: Record<string, string | number>) => string;
	brandTitle: string;
	brandSubtitle: string;
	brandLogoUrl?: string;
	onToggleLang: () => void;
}) {
	const inAdmin = route.startsWith('/admin');
	return (
		<header className="betterpos-header">
			<div className="header-brand">
				{brandLogoUrl ? <img src={brandLogoUrl} alt={brandTitle} className="header-brand-logo" /> : null}
				<div>
					<h1>{brandTitle || t('brandTitle')}</h1>
					<p>{brandSubtitle || t('brandSubtitle')}</p>
				</div>
			</div>
			<nav className="header-nav">
				<a
					className={!inAdmin ? 'active' : ''}
					href="#"
					onClick={(ev) => {
						ev.preventDefault();
						navigate('/pos');
					}}
				>
					{t('navPos')}
				</a>
				{canAdmin ? (
					<a
						className={inAdmin ? 'active' : ''}
						href="#"
						onClick={(ev) => {
							ev.preventDefault();
							navigate('/admin/dashboard');
						}}
					>
						{t('navAdmin')}
					</a>
				) : null}
				<button type="button" className="lang-toggle" onClick={onToggleLang}>
					{t('langToggle')}
				</button>
			</nav>
		</header>
	);
}

function POSScreen({
	config,
	t,
}: {
	config: BetterPOSConfig;
	t: (key: string, vars?: Record<string, string | number>) => string;
}) {
	const api = useMemo(() => createApi(config), [config]);
	const canSessionControl = config.permissions.canSessionControl;
	const [registers, setRegisters] = useState<Register[]>([]);
	const [selectedRegister, setSelectedRegister] = useState<Register | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [catalog, setCatalog] = useState<CatalogItem[]>([]);
	const [cart, setCart] = useState<CartLine[]>([]);
	const [loading, setLoading] = useState(false);
	const [pendingEuPagoTxId, setPendingEuPagoTxId] = useState<number | null>(null);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [openSessionModal, setOpenSessionModal] = useState(false);
	const [openingFloat, setOpeningFloat] = useState('0.00');
	const [closeSessionModal, setCloseSessionModal] = useState(false);
	const [countedCash, setCountedCash] = useState('0.00');
	const [phoneModal, setPhoneModal] = useState(false);
	const [phoneInput, setPhoneInput] = useState('');
	const [pendingPaymentChannel, setPendingPaymentChannel] = useState<'cash' | 'eupago' | null>(null);
	const eupagoPollRef = useRef<number | null>(null);

	const isPaymentPending = pendingEuPagoTxId !== null;

	useEffect(() => {
		return () => {
			if (eupagoPollRef.current !== null) {
				window.clearInterval(eupagoPollRef.current);
				eupagoPollRef.current = null;
			}
		};
	}, []);

	function refreshRegisters() {
		setLoading(true);
		setError('');
		api
			.registersList()
			.then((data) => {
				const nextRegisters = data.registers || [];
				setRegisters(nextRegisters);
				if (nextRegisters.length && !selectedRegister) {
					setSelectedRegister(nextRegisters[0]);
				}
			})
			.catch((err: Error) => setError(err.message))
			.finally(() => setLoading(false));
	}

	useEffect(() => {
		refreshRegisters();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!selectedRegister) return;
		api
			.sessionStatus(selectedRegister.id)
			.then((data) => {
				if (data.has_open_session && data.session) {
					setSession({
						id: data.session.id,
						register_id: selectedRegister.id,
						register_name: selectedRegister.name,
						status: 'open',
					});
					return api.catalog();
				}
				setSession(null);
				setCatalog([]);
				return null;
			})
			.then((catalogData) => {
				if (catalogData?.items) {
					setCatalog(catalogData.items);
				}
			})
			.catch((err: Error) => setError(err.message));
	}, [api, selectedRegister]);

	function openSession() {
		if (!selectedRegister) return;
		setOpeningFloat('0.00');
		setOpenSessionModal(true);
	}

	function confirmOpenSession() {
		if (!selectedRegister) return;
		setLoading(true);
		setError('');
		setNotice('');
		api
			.sessionOpen({ register_id: selectedRegister.id, opening_float: openingFloat })
			.then((data) => {
				setSession({
					id: data.session_id,
					register_id: selectedRegister.id,
					register_name: selectedRegister.name,
					status: data.status,
				});
				return api.catalog();
			})
			.then((catalogData) => {
				setCatalog(catalogData.items || []);
			})
			.catch((err: Error) => setError(err.message))
			.finally(() => {
				setLoading(false);
				setOpenSessionModal(false);
			});
	}

	function closeSession() {
		if (!session) return;
		setCountedCash('0.00');
		setCloseSessionModal(true);
	}

	function confirmCloseSession() {
		if (!session) return;
		setLoading(true);
		setError('');
		setNotice('');
		api
			.sessionClose({ register_id: session.register_id, counted_cash: countedCash })
			.then(() => {
				setSession(null);
				setCart([]);
				setCatalog([]);
			})
			.catch((err: Error) => setError(err.message))
			.finally(() => {
				setLoading(false);
				setCloseSessionModal(false);
			});
	}

	function addToCart(item: CatalogItem) {
		setCart((old) => {
			const existing = old.find((line) => line.item_id === item.id);
			if (existing) {
				return old.map((line) =>
					line.item_id === item.id
						? {
								...line,
								qty: line.qty + 1,
							}
						: line
				);
			}
			return old.concat([
				{
					item_id: item.id,
					name: item.name,
					price: Number(item.price || 0),
					qty: 1,
				},
			]);
		});
	}

	function clearCart() {
		setCart([]);
	}

	async function createOrderTransaction(phone: string): Promise<Transaction> {
		if (!session) {
			throw new Error(t('openSessionToSell'));
		}
		const lines = cart.map((line) => ({ item_id: line.item_id, quantity: line.qty }));
		const idempotency = `${Date.now()}-${session.register_id}-${cart.length}`;
		const created = await api.orderCreate({
			register_id: session.register_id,
			lines,
			idempotency_key: idempotency,
			phone,
		});
		return created.transaction;
	}

	function askPhoneFor(channel: 'cash' | 'eupago') {
		setPhoneInput('');
		setPendingPaymentChannel(channel);
		setPhoneModal(true);
	}

	async function startCashPayment(phone: string) {
		if (!session || !cart.length || isPaymentPending) return;
		setLoading(true);
		setError('');
		setNotice('');
		try {
			const transaction = await createOrderTransaction(phone);
			await api.payCash({ transaction_id: transaction.id, phone });
			setCart([]);
			setNotice(t('cashSuccess'));
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	}

	async function startEupagoPayment(phone: string) {
		if (!session || !cart.length || isPaymentPending) return;
		setLoading(true);
		setError('');
		setNotice('');
		try {
			const transaction = await createOrderTransaction(phone);
			const initiated = await api.payEupago({
				transaction_id: transaction.id,
				provider: 'eupago_mbway',
				phone,
			});
			setPendingEuPagoTxId(transaction.id);

			setNotice(t('eupagoStarted', { id: initiated.payment_id }));

			if (eupagoPollRef.current !== null) {
				window.clearInterval(eupagoPollRef.current);
			}

			eupagoPollRef.current = window.setInterval(async () => {
				try {
					const status = await api.transactionStatus(transaction.id);
					if (status.transaction.state === 'paid') {
						if (eupagoPollRef.current !== null) {
							window.clearInterval(eupagoPollRef.current);
							eupagoPollRef.current = null;
						}
						setPendingEuPagoTxId(null);
						setCart([]);
						setNotice(t('eupagoConfirmed'));
					} else if (['failed', 'expired', 'cancelled_unpaid', 'refund_partial', 'refund_full'].includes(status.transaction.state)) {
						if (eupagoPollRef.current !== null) {
							window.clearInterval(eupagoPollRef.current);
							eupagoPollRef.current = null;
						}
						setPendingEuPagoTxId(null);
						setError(t('eupagoEndedState', { state: status.transaction.state }));
					}
				} catch (pollErr) {
					if (eupagoPollRef.current !== null) {
						window.clearInterval(eupagoPollRef.current);
						eupagoPollRef.current = null;
					}
					setPendingEuPagoTxId(null);
					setError((pollErr as Error).message);
				}
			}, 2500);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	}

	async function confirmPhoneAndPay() {
		const normalizedPhone = phoneInput.replace(/\s+/g, '');
		if (!normalizedPhone) {
			setError(t('phoneRequired'));
			return;
		}
		setPhoneModal(false);
		if (pendingPaymentChannel === 'cash') {
			await startCashPayment(normalizedPhone);
		}
		if (pendingPaymentChannel === 'eupago') {
			await startEupagoPayment(normalizedPhone);
		}
		setPendingPaymentChannel(null);
	}

	const total = useMemo(
		() => cart.reduce((acc, line) => acc + line.price * line.qty, 0),
		[cart]
	);

	return (
		<div className="view pos-view">
			<Banner error={error} />
			{notice ? <div className="alert alert-success">{notice}</div> : null}
			{isPaymentPending ? <div className="alert alert-info">{t('timeoutHint')}</div> : null}

			<div className="pos-header">
				<div className="pos-session-info">
					<span className="session-chip">{selectedRegister ? selectedRegister.code : '--'}</span>
					<div className="session-meta">
						<strong>{t('registerLabel')}: {selectedRegister ? selectedRegister.name : t('registerNone')}</strong>
						<p className="muted">{loading ? t('loading') : isPaymentPending ? t('paymentPending') : ''}</p>
					</div>
				</div>
				<div className="pos-controls">
					<select
						className="register-select"
						value={selectedRegister ? selectedRegister.id : ''}
						disabled={isPaymentPending}
						onChange={(ev) => {
							const id = Number(ev.target.value);
							const reg = registers.find((r) => r.id === id);
							setSelectedRegister(reg || null);
						}}
					>
						<option value="">{t('selectRegister')}</option>
						{registers.map((reg) => (
							<option key={reg.id} value={reg.id}>
								{reg.name} ({reg.code})
							</option>
						))}
					</select>{' '}
					{canSessionControl ? (
						session ? (
							<button className="session-btn session-btn-close" onClick={closeSession} disabled={loading || isPaymentPending}>
								{t('closeSession')}
							</button>
						) : (
							<button className="session-btn session-btn-open" onClick={openSession} disabled={!selectedRegister || loading || isPaymentPending}>
								{t('openSession')}
							</button>
						)
					) : null}
				</div>
			</div>

			{session ? (
				<div className="pos-container">
					<div className="pos-catalog">
						<div className="pos-section-head">
							<h3>{t('catalog')}</h3>
							<span className="section-pill">{catalog.length}</span>
						</div>
						<div className="catalog-grid">
							{catalog.map((item) => (
								<div key={item.id} className="catalog-card">
									<h4>{item.name}</h4>
									<p className="price">{toMoney(item.price)} EUR</p>
									<button onClick={() => addToCart(item)} disabled={isPaymentPending}>{t('add')}</button>
								</div>
							))}
						</div>
					</div>

					<div className="pos-cart">
						<div className="pos-section-head">
							<h3>{t('cart')}</h3>
							<span className="section-pill">{cart.length}</span>
						</div>
						<div className="cart-items">
							{cart.length ? (
								cart.map((line) => (
									<div key={line.item_id} className="cart-line">
										<div>
											<strong>{line.name}</strong>
											<div className="muted">{toMoney(line.price)} EUR</div>
										</div>
										<div className="line-total">
											x{line.qty} = {toMoney(line.price * line.qty)} EUR
										</div>
									</div>
								))
							) : (
								<p className="muted">{t('emptyCart')}</p>
							)}
						</div>

						<div className="cart-summary">
							<h4>{t('totalToPay')}: {toMoney(total)} EUR</h4>
							<p>{cart.length}x</p>
						</div>

						<button className="pay-btn pay-btn-cash" onClick={() => askPhoneFor('cash')} disabled={loading || !cart.length || !config.permissions.canSell || isPaymentPending}>
							{t('payCash')}
						</button>
						<button className="pay-btn pay-btn-eupago" onClick={() => askPhoneFor('eupago')} disabled={loading || !cart.length || !config.permissions.canSell || isPaymentPending}>
							{t('payEuPago')}
						</button>
						<button className="pay-btn pay-btn-clear" onClick={clearCart} disabled={loading || !cart.length || isPaymentPending}>
							{t('clearCart')}
						</button>
					</div>
				</div>
			) : (
				<div className="view pos-empty-state">
					<p>{t('openSessionToSell')}</p>
				</div>
			)}

			<Modal open={openSessionModal} title={t('openSession')} onClose={() => setOpenSessionModal(false)}>
				<label>{t('openingFloatPrompt')}</label>
				<input value={openingFloat} onChange={(ev) => setOpeningFloat(ev.target.value)} />
				<div className="modal-actions">
					<button type="button" className="btn-secondary" onClick={() => setOpenSessionModal(false)}>{t('cancel')}</button>
					<button type="button" onClick={confirmOpenSession} disabled={loading}>{t('openSession')}</button>
				</div>
			</Modal>

			<Modal open={closeSessionModal} title={t('closeSession')} onClose={() => setCloseSessionModal(false)}>
				<label>{t('countedCashPrompt')}</label>
				<input value={countedCash} onChange={(ev) => setCountedCash(ev.target.value)} />
				<div className="modal-actions">
					<button type="button" className="btn-secondary" onClick={() => setCloseSessionModal(false)}>{t('cancel')}</button>
					<button type="button" onClick={confirmCloseSession} disabled={loading}>{t('closeSession')}</button>
				</div>
			</Modal>

			<Modal open={phoneModal} title={t('phonePrompt')} onClose={() => setPhoneModal(false)}>
				<label>{t('phonePrompt')}</label>
				<input value={phoneInput} onChange={(ev) => setPhoneInput(ev.target.value)} placeholder="9XXXXXXXX" />
				<div className="modal-actions">
					<button type="button" className="btn-secondary" onClick={() => setPhoneModal(false)}>{t('cancel')}</button>
					<button type="button" onClick={confirmPhoneAndPay} disabled={loading}>{t('save')}</button>
				</div>
			</Modal>
		</div>
	);
}

function AdminRegisters({
	config,
	t,
}: {
	config: BetterPOSConfig;
	t: (key: string, vars?: Record<string, string | number>) => string;
}) {
	const api = useMemo(() => createApi(config), [config]);
	const [rows, setRows] = useState<Register[]>([]);
	const [name, setName] = useState('');
	const [code, setCode] = useState('');
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editingName, setEditingName] = useState('');
	const [editingCode, setEditingCode] = useState('');
	const [deactivatingRow, setDeactivatingRow] = useState<Register | null>(null);
	const [error, setError] = useState('');

	function load() {
		api
			.registersList()
			.then((data) => setRows(data.registers || []))
			.catch((err: Error) => setError(err.message));
	}

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function create() {
		if (!name.trim() || !code.trim()) return;
		setError('');
		api
			.registerCreate({ name: name.trim(), code: code.trim(), currency: 'EUR' })
			.then(() => {
				setName('');
				setCode('');
				load();
			})
			.catch((err: Error) => setError(err.message));
	}

	function rename(row: Register) {
		setEditingId(row.id);
		setEditingName(row.name);
		setEditingCode(row.code);
	}

	function deactivate(row: Register) {
		setDeactivatingRow(row);
	}

	function confirmDeactivate() {
		if (!deactivatingRow) return;
		api
			.registerDelete(deactivatingRow.id)
			.then(load)
			.catch((err: Error) => setError(err.message))
			.finally(() => setDeactivatingRow(null));
	}

	function cancelEdit() {
		setEditingId(null);
		setEditingName('');
		setEditingCode('');
	}

	function saveEdit() {
		if (editingId === null || !editingName.trim() || !editingCode.trim()) return;
		const row = rows.find((item) => item.id === editingId);
		if (!row) return;
		setError('');
		api
			.registerUpdate(editingId, {
				name: editingName.trim(),
				code: editingCode.trim(),
				currency: row.currency,
				is_active: row.is_active !== false,
			})
			.then(() => {
				cancelEdit();
				load();
			})
			.catch((err: Error) => setError(err.message));
	}

	return (
		<div className="view">
			<Banner error={error} />
			<h3>{t('registers')}</h3>
			<div className="card register-form-card">
				<div className="register-form-header">
					<h4>{t('create')}</h4>
					<p className="muted">{t('registers')}</p>
				</div>
				<div className="register-form-grid">
					<input value={name} onChange={(ev) => setName(ev.target.value)} placeholder={t('name')} />
					<input value={code} onChange={(ev) => setCode(ev.target.value)} placeholder={t('code')} />
				</div>
				<button onClick={create} disabled={!config.permissions.canManageRegisters}>
					{t('create')}
				</button>
			</div>
			{editingId !== null ? (
				<div className="card register-form-card register-editor-card">
					<div className="register-form-header">
						<h4>{t('edit')}</h4>
						<p className="muted">{rows.find((row) => row.id === editingId)?.name || ''}</p>
					</div>
					<div className="register-form-grid">
						<input value={editingName} onChange={(ev) => setEditingName(ev.target.value)} placeholder={t('name')} />
						<input value={editingCode} onChange={(ev) => setEditingCode(ev.target.value)} placeholder={t('code')} />
					</div>
					<div className="register-form-actions">
						<button onClick={saveEdit} disabled={!config.permissions.canManageRegisters}>
							{t('save')}
						</button>
						<button type="button" className="btn-secondary" onClick={cancelEdit}>
							{t('cancel')}
						</button>
					</div>
				</div>
			) : null}
			<div className="card">
				<table className="admin-table">
					<thead>
						<tr>
							<th>{t('name')}</th>
							<th>{t('code')}</th>
							<th>{t('status')}</th>
							<th>{t('actions')}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.id}>
								<td>{row.name}</td>
								<td>{row.code}</td>
								<td>
									<span className={`status-badge ${row.is_active === false ? 'status-failed' : 'status-paid'}`}>
										{row.is_active === false ? t('inactive') : t('active')}
									</span>
								</td>
								<td>
									<button onClick={() => rename(row)} disabled={!config.permissions.canManageRegisters}>
										{t('edit')}
									</button>{' '}
									<button onClick={() => deactivate(row)} disabled={!config.permissions.canManageRegisters}>
										{t('deactivate')}
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<Modal
				open={deactivatingRow !== null}
				title={t('deactivate')}
				onClose={() => setDeactivatingRow(null)}
			>
				<p>{deactivatingRow ? t('disableRegisterConfirm', { name: deactivatingRow.name }) : ''}</p>
				<div className="modal-actions">
					<button type="button" className="btn-secondary" onClick={() => setDeactivatingRow(null)}>{t('cancel')}</button>
					<button type="button" onClick={confirmDeactivate}>{t('deactivate')}</button>
				</div>
			</Modal>
		</div>
	);
}

function DataTableScreen({
	title,
	rows,
	columns,
	error,
	t,
}: {
	title: string;
	rows: TableRow[];
	columns: Array<{ key: string; label: string }>;
	error: string;
	t: (key: string, vars?: Record<string, string | number>) => string;
}) {
	const [query, setQuery] = useState('');
	const [compact, setCompact] = useState(false);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((row) =>
			columns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(q))
		);
	}, [rows, columns, query]);

	const primaryColumn = columns[0];

	function renderCellValue(row: TableRow, colKey: string): string | JSX.Element {
		const raw = row[colKey];
		const text = String(raw ?? '');

		if (!text) return '';

		if (colKey === 'state' || colKey === 'status') {
			return <span className={stateBadgeClass(text)}>{translateStateLabel(text, (k) => t(k))}</span>;
		}

		if (colKey === 'created_at' || colKey === 'opened_at') {
			return looksLikeDate(text) ? formatDateValue(text) : text;
		}

		if (looksLikeDate(text)) {
			return formatDateValue(text);
		}

		return text;
	}

	return (
		<div className="view">
			<Banner error={error} />
			<h3>{title}</h3>
			<div className="card">
				<div className="table-toolbar">
					<label>{t('search')}</label>
					<input
						type="text"
						value={query}
						onChange={(ev) => setQuery(ev.target.value)}
						placeholder={t('searchPlaceholder', { title })}
					/>
					<button type="button" className="table-density-btn" onClick={() => setCompact((old) => !old)}>
						{compact ? t('comfortable') : t('compact')}
					</button>
					<span className="table-results">{t('results', { count: filteredRows.length })}</span>
				</div>
				<table className={`admin-table ${compact ? 'table-compact' : ''}`}>
					<thead>
						<tr>
							{columns.map((col) => (
								<th key={col.key}>{col.label}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{filteredRows.map((row, idx) => (
							<tr key={String(row.id || idx)}>
								{columns.map((col) => (
									<td key={col.key}>{renderCellValue(row, col.key)}</td>
								))}
							</tr>
						))}
						{filteredRows.length === 0 ? (
							<tr>
								<td colSpan={columns.length} className="table-empty">{t('noResults')}</td>
							</tr>
						) : null}
					</tbody>
				</table>
				<div className="table-cards">
					{filteredRows.length ? (
						filteredRows.map((row, idx) => (
							<div key={String(row.id || idx)} className="table-card">
								<div className="table-card-head">
									<div>
										<h4>{primaryColumn ? String(row[primaryColumn.key] ?? '') : title}</h4>
										<p className="muted">{title}</p>
									</div>
									{row.state || row.status ? (
										<span className={stateBadgeClass(String(row.state ?? row.status))}>
											{translateStateLabel(String(row.state ?? row.status), (k) => t(k))}
										</span>
									) : null}
								</div>
								<dl className="table-card-fields">
									{columns.slice(0, 5).map((col) => {
										if (primaryColumn && col.key === primaryColumn.key) return null;
										const value = renderCellValue(row, col.key);
										return (
											<div key={col.key}>
												<dt>{col.label}</dt>
												<dd>{value}</dd>
											</div>
										);
									})}
								</dl>
							</div>
						))
					) : (
						<div className="table-card table-card-empty">{t('noResults')}</div>
					)}
				</div>
			</div>
		</div>
	);
}

function AdminDashboardWithText({
	config,
	t,
}: {
	config: BetterPOSConfig;
	t: (key: string, vars?: Record<string, string | number>) => string;
}) {
	const api = useMemo(() => createApi(config), [config]);
	const [report, setReport] = useState<ReportSummary | null>(null);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [txs, setTxs] = useState<Transaction[]>([]);
	const [error, setError] = useState('');

	useEffect(() => {
		Promise.all([api.reportsSummary(1), api.sessionsList(), api.transactionsList()])
			.then(([r, s, tData]) => {
				setReport(r);
				setSessions(s.sessions || []);
				setTxs(tData.transactions || []);
			})
			.catch((err: Error) => setError(err.message));
	}, [api]);

	const openSessions = sessions.filter((s) => s.status === 'open').length;

	return (
		<div className="view">
			<Banner error={error} />
			<h3>{t('dashboard')}</h3>
			<div className="catalog-grid">
				<div className="card">
					<h4>{t('salesToday')}</h4>
					<p>{toMoney(report?.total_sales || 0)} EUR</p>
					<p className="muted">{report?.total_count || 0} {t('totalTransactions')}</p>
				</div>
				<div className="card">
					<h4>{t('openSessions')}</h4>
					<p>{openSessions}</p>
					<p className="muted">{t('activeRegistersNow')}</p>
				</div>
				<div className="card">
					<h4>{t('recentTransactions')}</h4>
					<p>{txs.length}</p>
					<p className="muted">{t('latestLoaded')}</p>
				</div>
			</div>
		</div>
	);
}

function AdminReports({
	config,
	t,
}: {
	config: BetterPOSConfig;
	t: (key: string, vars?: Record<string, string | number>) => string;
}) {
	const api = useMemo(() => createApi(config), [config]);
	const [days, setDays] = useState(30);
	const [report, setReport] = useState<ReportSummary | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		setError('');
		api
			.reportsSummary(days)
			.then(setReport)
			.catch((err: Error) => setError(err.message));
	}, [api, days]);

	return (
		<div className="view">
			<Banner error={error} />
			<h3>{t('reports')}</h3>
			<div className="card">
				<label>{t('periodDays')}: </label>
				<select value={days} onChange={(ev) => setDays(Number(ev.target.value))}>
					<option value={7}>7</option>
					<option value={30}>30</option>
					<option value={90}>90</option>
				</select>
			</div>
			{report ? (
				<div className="card">
					<p>{t('totalSales')}: {toMoney(report.total_sales)} EUR</p>
					<p>{t('transactionsCount')}: {report.total_count}</p>
					<ul>
						{(report.by_channel || []).map((ch) => (
							<li key={ch.channel}>
								{ch.label}: {toMoney(ch.total)} EUR ({ch.count})
							</li>
						))}
					</ul>
				</div>
			) : (
				<p>{t('loadingDots')}</p>
			)}
		</div>
	);
}

function AdminScreen({
	route,
	config,
	t,
}: {
	route: string;
	config: BetterPOSConfig;
	t: (key: string, vars?: Record<string, string | number>) => string;
}) {
	const api = useMemo(() => createApi(config), [config]);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [txs, setTxs] = useState<Transaction[]>([]);
	const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
	const [error, setError] = useState('');

	useEffect(() => {
		if (route.startsWith('/admin/sessions')) {
			api
				.sessionsList()
				.then((data) => setSessions(data.sessions || []))
				.catch((err: Error) => setError(err.message));
		}
		if (route.startsWith('/admin/transactions')) {
			api
				.transactionsList()
				.then((data) => setTxs(data.transactions || []))
				.catch((err: Error) => setError(err.message));
		}
		if (route.startsWith('/admin/audit')) {
			api
				.auditFeed()
				.then((data) => setAuditRows(data.actions || []))
				.catch((err: Error) => setError(err.message));
		}
	}, [api, route]);

	if (route.startsWith('/admin/dashboard')) {
		return <AdminDashboardWithText config={config} t={t} />;
	}
	if (route.startsWith('/admin/registers')) {
		return <AdminRegisters config={config} t={t} />;
	}
	if (route.startsWith('/admin/sessions')) {
		return (
			<DataTableScreen
				title={t('sessions')}
				error={error}
				t={t}
				rows={sessions as unknown as TableRow[]}
				columns={[
					{ key: 'id', label: 'ID' },
					{ key: 'register_name', label: t('register') },
					{ key: 'status', label: t('status') },
					{ key: 'opened_at', label: t('opened') },
					{ key: 'difference', label: t('difference') },
				]}
			/>
		);
	}
	if (route.startsWith('/admin/transactions')) {
		return (
			<DataTableScreen
				title={t('transactions')}
				error={error}
				t={t}
				rows={txs as unknown as TableRow[]}
				columns={[
					{ key: 'order_code', label: t('order') },
					{ key: 'amount', label: t('amount') },
					{ key: 'channel', label: t('channel') },
					{ key: 'state', label: t('status') },
					{ key: 'operator_name', label: t('operator') },
					{ key: 'created_at', label: t('created') },
				]}
			/>
		);
	}
	if (route.startsWith('/admin/audit')) {
		return (
			<DataTableScreen
				title={t('audit')}
				error={error}
				t={t}
				rows={auditRows as unknown as TableRow[]}
				columns={[
					{ key: 'action_type', label: t('action') },
					{ key: 'actor_id', label: t('actor') },
					{ key: 'register_id', label: t('register') },
					{ key: 'created_at', label: t('created') },
				]}
			/>
		);
	}
	if (route.startsWith('/admin/reports')) {
		return <AdminReports config={config} t={t} />;
	}

	return <div className="view">{t('unknownRoute')}</div>;
}

function AdminSubnav({
	route,
	navigate,
	t,
}: {
	route: string;
	navigate: (route: string) => void;
	t: (key: string, vars?: Record<string, string | number>) => string;
}) {
	const tabs = [
		{ key: '/admin/dashboard', label: t('dashboard') },
		{ key: '/admin/registers', label: t('registers') },
		{ key: '/admin/sessions', label: t('sessions') },
		{ key: '/admin/transactions', label: t('transactions') },
		{ key: '/admin/audit', label: t('audit') },
		{ key: '/admin/reports', label: t('reports') },
	];

	return (
		<div className="admin-subnav">
			<strong className="admin-subnav-title">{t('admin')}</strong>
			<div className="admin-subnav-tabs">
				{tabs.map((tab) => {
					const active = route.indexOf(tab.key) === 0;
					return (
						<a
							key={tab.key}
							href="#"
							className={`admin-subnav-tab ${active ? 'active' : ''}`}
							onClick={(ev) => {
								ev.preventDefault();
								navigate(tab.key);
							}}
						>
							{tab.label}
						</a>
					);
				})}
			</div>
		</div>
	);
}

export default function App({ config }: AppProps) {
	const [route, navigate] = useAppRoute(config.basePath);
	const [lang, setLang] = useState<UILang>(initialLang());
	const permissions = config.permissions;
	const canAdmin = !!(
		permissions.canManageRegisters || permissions.canViewAudit || permissions.canSessionControl
	);

	const t = (key: string, vars: Record<string, string | number> = {}) => {
		let value = uiText[lang][key] ?? uiText.pt[key] ?? key;
		Object.keys(vars).forEach((name) => {
			value = value.replace(`%${name}%`, String(vars[name]));
		});
		return value;
	};

	useEffect(() => {
		if (route === '/admin' && canAdmin) {
			navigate('/admin/dashboard');
		}
		if (route === '/admin' && !canAdmin) {
			navigate('/pos');
		}
	}, [canAdmin, navigate, route]);

	useEffect(() => {
		applyBrandColors(config);
	}, [config]);

	const brandTitle = (config.eventName || '').trim() || t('brandTitle');
	const brandSubtitle = (config.organizerName || '').trim() || t('brandSubtitle');
	const brandLogoUrl = (config.organizerLogoUrl || '').trim() || undefined;

	return (
		<div className="betterpos-container">
			<AppHeader
				navigate={navigate}
				canAdmin={canAdmin}
				route={route}
				t={t}
				brandTitle={brandTitle}
				brandSubtitle={brandSubtitle}
				brandLogoUrl={brandLogoUrl}
				onToggleLang={() => setLang((old) => (old === 'pt' ? 'en' : 'pt'))}
			/>
			{route.startsWith('/admin') ? (
				canAdmin ? (
					<div>
						<AdminSubnav route={route} navigate={navigate} t={t} />
						<AdminScreen route={route} config={config} t={t} />
					</div>
				) : (
					<div className="view">
						<h3>{t('accessDenied')}</h3>
						<p>{t('accessDeniedBody')}</p>
					</div>
				)
			) : (
				<POSScreen config={config} t={t} />
			)}
		</div>
	);
}
