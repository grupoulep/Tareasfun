import React, { useState, useEffect } from 'react';
import { AppUser } from '../types';
import { saveUserToFirestore, recordAuditLog } from '../firebase';
import {
  COLOMBIAN_CITIES,
  COLOMBIAN_DEPARTMENTS,
  ALL_COLOMBIAN_MUNICIPALITIES_WITH_DEPT,
  getMunicipalitiesByDepartment,
  BANK_OPTIONS,
  EMERGENCY_RELATIONSHIPS,
  FAMILY_COMPOSITION_OPTIONS,
  BANK_HOLDER_OPTIONS,
  DEPARTMENT_OPTIONS,
  BLOOD_TYPES,
  MARITAL_STATUS_OPTIONS,
  RESIDENCE_TYPES,
  STRATUM_OPTIONS,
  BANK_ACCOUNT_TYPES,
  SINGLE_ADMIN_CEDULA,
  ADMIN_MASTER_AUTH_CEDULA,
} from '../constants';
import { SearchableLocationSelect } from './SearchableLocationSelect';

export type TabKey = 'personal' | 'residence' | 'family' | 'bank' | 'security';

interface EditUserModalProps {
  user: AppUser | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
  initialTab?: TabKey;
  onSaveSuccess?: (updatedUser: AppUser) => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  isOpen,
  onClose,
  currentUser,
  initialTab = 'personal',
  onSaveSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Estados exclusivos para cambio de contraseña del Único Admin (902050377)
  const [adminAuthCedula, setAdminAuthCedula] = useState('');
  const [adminOldPassword, setAdminOldPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Operaciones y Logística');
  const [approvalStatus, setApprovalStatus] = useState<'aprobado' | 'pendiente' | 'rechazado'>('aprobado');

  // Identificación
  const [cedulaIssuePlace, setCedulaIssuePlace] = useState('Bogotá D.C.');
  const [cedulaIssueDate, setCedulaIssueDate] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('Bogotá D.C.');
  const [bloodType, setBloodType] = useState('O+');
  const [maritalStatus, setMaritalStatus] = useState('Soltero(a)');
  const [phone, setPhone] = useState('');

  // Residencia
  const [locationDepartmentState, setLocationDepartmentState] = useState('Bogotá D.C.');
  const [locationCity, setLocationCity] = useState('Bogotá D.C.');
  const [residenceAddress, setResidenceAddress] = useState('');
  const [residenceType, setResidenceType] = useState('Arrendada');
  const [residenceStratum, setResidenceStratum] = useState('Estrato 3');

  // Familia
  const [familyMembersCount, setFamilyMembersCount] = useState<number>(0);
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('Cónyuge / Pareja');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [familyNotes, setFamilyNotes] = useState('Cónyuge e hijos menores de edad');

  // Banco
  const [bankName, setBankName] = useState('Bancolombia');
  const [bankAccountType, setBankAccountType] = useState('Cuenta de Ahorros');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('A mi nombre (Mismo titular del colaborador)');

  // Permisos
  const [canCreateTasks, setCanCreateTasks] = useState(true);
  const [canEditTasks, setCanEditTasks] = useState(true);
  const [canDeleteTasks, setCanDeleteTasks] = useState(false);
  const [canSendChat, setCanSendChat] = useState(true);
  const [canViewVault, setCanViewVault] = useState(true);
  const [canExportReports, setCanExportReports] = useState(true);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPassword(user.password || '');
      setEmail(user.email || '');
      setDepartment(user.department || 'Operaciones y Logística');
      setApprovalStatus(user.cedula === SINGLE_ADMIN_CEDULA ? 'aprobado' : (user.approvalStatus || 'aprobado'));

      setCedulaIssuePlace(user.cedulaIssuePlace || 'Bogotá D.C.');
      setCedulaIssueDate(user.cedulaIssueDate || '');
      setBirthDate(user.birthDate || '');
      setBirthPlace(user.birthPlace || 'Bogotá D.C.');
      setBloodType(user.bloodType || 'O+');
      setMaritalStatus(user.maritalStatus || 'Soltero(a)');
      setPhone(user.phone || '');

      setLocationDepartmentState(user.locationDepartmentState || 'Bogotá D.C.');
      setLocationCity(user.locationCity || 'Bogotá D.C.');
      setResidenceAddress(user.residenceAddress || '');
      setResidenceType(user.residenceType || 'Arrendada');
      setResidenceStratum(user.residenceStratum || 'Estrato 3');

      setFamilyMembersCount(typeof user.familyMembersCount === 'number' ? user.familyMembersCount : 0);
      setEmergencyContactName(user.emergencyContactName || '');
      setEmergencyRelationship(user.emergencyRelationship || 'Cónyuge / Pareja');
      setEmergencyContactPhone(user.emergencyContactPhone || '');
      setFamilyNotes(user.familyNotes || 'Cónyuge e hijos menores de edad');

      setBankName(user.bankName || 'Bancolombia');
      setBankAccountType(user.bankAccountType || 'Cuenta de Ahorros');
      setBankAccountNumber(user.bankAccountNumber || '');
      setBankAccountHolder(user.bankAccountHolder || 'A mi nombre (Mismo titular del colaborador)');

      const isSingleAdmin = user.cedula === SINGLE_ADMIN_CEDULA;
      setCanCreateTasks(isSingleAdmin ? true : (user.canCreateTasks ?? true));
      setCanEditTasks(isSingleAdmin ? true : (user.canEditTasks ?? true));
      setCanDeleteTasks(isSingleAdmin ? true : (user.canDeleteTasks ?? false));
      setCanSendChat(isSingleAdmin ? true : (user.canSendChat ?? true));
      setCanViewVault(isSingleAdmin ? true : (user.canViewVault ?? true));
      setCanExportReports(isSingleAdmin ? true : (user.canExportReports ?? true));

      setAdminAuthCedula('');
      setAdminOldPassword('');
      setAdminNewPassword('');
      setActiveTab(initialTab || 'personal');
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [user, initialTab, isOpen]);

  if (!isOpen || !user) return null;

  const isTargetSingleAdmin = user.cedula === SINGLE_ADMIN_CEDULA;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('El nombre completo es obligatorio.');
      return;
    }

    let finalPassword = user.password;

    if (isTargetSingleAdmin) {
      const wantsPasswordChange =
        adminAuthCedula.trim().length > 0 ||
        adminOldPassword.length > 0 ||
        adminNewPassword.trim().length > 0;

      if (wantsPasswordChange) {
        if (adminAuthCedula.trim() !== ADMIN_MASTER_AUTH_CEDULA) {
          setActiveTab('security');
          setErrorMessage('El número de cédula de autorización ingresado no es válido para cambiar la contraseña del Administrador.');
          return;
        }
        if (adminOldPassword !== user.password) {
          setActiveTab('security');
          setErrorMessage('La contraseña anterior ingresada no coincide con la contraseña actual del Administrador.');
          return;
        }
        if (adminNewPassword.trim().length < 4) {
          setActiveTab('security');
          setErrorMessage('Debes ingresar una nueva contraseña de al menos 4 caracteres.');
          return;
        }
        finalPassword = adminNewPassword.trim();
      }
    } else {
      if (!password.trim()) {
        setErrorMessage('La contraseña de acceso es obligatoria.');
        return;
      }
      finalPassword = password.trim();
    }

    try {
      setSaving(true);
      setErrorMessage(null);

      const updatedUser: AppUser = {
        ...user,
        name: name.trim(),
        password: finalPassword,
        role: isTargetSingleAdmin ? 'admin' : 'user',
        email: email.trim() || `${user.cedula}@fundacionulep.org`,
        department: department.trim() || 'Operaciones y Logística',
        approvalStatus: isTargetSingleAdmin ? 'aprobado' : approvalStatus,
        cedulaIssuePlace: cedulaIssuePlace.trim(),
        cedulaIssueDate: cedulaIssueDate.trim(),
        birthDate: birthDate.trim(),
        birthPlace: birthPlace.trim(),
        bloodType: bloodType.trim(),
        maritalStatus: maritalStatus.trim(),
        phone: phone.trim(),
        locationDepartmentState: locationDepartmentState.trim(),
        locationCity: locationCity.trim(),
        residenceAddress: residenceAddress.trim(),
        residenceType: residenceType.trim(),
        residenceStratum: residenceStratum.trim(),
        familyMembersCount: Number(familyMembersCount) || 0,
        emergencyContactName: emergencyContactName.trim(),
        emergencyRelationship: emergencyRelationship.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        familyNotes: familyNotes.trim(),
        bankName: bankName.trim(),
        bankAccountType: bankAccountType.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankAccountHolder: bankAccountHolder.trim() || name.trim(),
        canCreateTasks: isTargetSingleAdmin ? true : canCreateTasks,
        canEditTasks: isTargetSingleAdmin ? true : canEditTasks,
        canDeleteTasks: isTargetSingleAdmin ? true : canDeleteTasks,
        canSendChat: isTargetSingleAdmin ? true : canSendChat,
        canViewVault: isTargetSingleAdmin ? true : canViewVault,
        canExportReports: isTargetSingleAdmin ? true : canExportReports,
      };

      await saveUserToFirestore(updatedUser);

      await recordAuditLog({
        actorCedula: currentUser.cedula,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: 'EDITAR_USUARIO_ADMIN',
        module: 'ADMIN_USUARIOS',
        description: `Actualizó los datos de ${updatedUser.name} (C.C. ${updatedUser.cedula}).`,
        targetId: updatedUser.cedula,
        severity: 'info',
      });

      setSuccessMessage('¡Datos guardados y actualizados exitosamente en la base de datos!');

      if (onSaveSuccess) {
        onSaveSuccess(updatedUser);
      }

      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setErrorMessage(`Error al actualizar el usuario: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'personal', label: '1. Cédula e Identificación', icon: 'fi-rr-id-badge' },
    { key: 'residence', label: '2. Ubicación y Residencia', icon: 'fi-rr-marker' },
    { key: 'family', label: '3. Núcleo Familiar', icon: 'fi-rr-users' },
    { key: 'bank', label: '4. Datos Bancarios (Pagos)', icon: 'fi-rr-bank' },
    { key: 'security', label: '5. Acceso, Rol y Permisos', icon: 'fi-rr-shield-check' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#0B2559]/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl border-t-2 sm:border-2 border-[#B3D9FF] w-full max-w-4xl max-h-[94vh] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden sm:my-auto animate-fadeIn">
        {/* Barra de arrastre para Teléfono */}
        <div className="sm:hidden pt-2 pb-1 bg-[#0B2559] flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-[#B3D9FF]/50" />
        </div>

        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 bg-[#0B2559] text-white flex items-center justify-between border-b border-[#1A3A73] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0 shadow-2xs font-bold">
              <i className="fi fi-rr-edit text-base sm:text-lg" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">
                  {isTargetSingleAdmin ? 'Administrador Único del Sistema' : 'Editar Datos del Usuario y Ficha Personal'}
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#B3D9FF] text-[#0B2559] font-bold">
                  C.C. {user.cedula}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                    isTargetSingleAdmin
                      ? 'bg-amber-300 text-amber-950'
                      : 'bg-white/20 text-white'
                  }`}
                >
                  {isTargetSingleAdmin ? 'Admin Único · No Eliminable' : 'Usuario'}
                </span>
              </div>
              <p className="hidden sm:block text-xs text-[#B3D9FF] mt-0.5 truncate">
                Modifica los datos registrados de ({user.name}) con guardado directo en el sistema.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors text-sm shrink-0"
            title="Cerrar ventana"
          >
            <i className="fi fi-rr-cross text-xs" />
          </button>
        </div>

        {/* Selector Rápido de Sección en Teléfono */}
        <div className="sm:hidden bg-[#F4F9FF] border-b border-[#D6EAFF] p-3 shrink-0">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#3B82F6] mb-1">
            Sección de Datos a Editar (5 disponibles):
          </label>
          <select
            value={activeTab}
            onChange={e => setActiveTab(e.target.value as TabKey)}
            className="w-full min-h-[42px] px-3 py-2 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl focus:outline-none focus:border-[#0B2559]"
          >
            {tabs.map(t => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tab Navigation en Tablet y PC */}
        <div className="hidden sm:flex bg-[#F4F9FF] border-b border-[#D6EAFF] px-4 pt-2 items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-thin">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-xs font-bold rounded-t-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 border-t border-x ${
                  isActive
                    ? 'bg-white text-[#0B2559] border-[#B3D9FF] border-b-transparent shadow-xs -mb-px'
                    : 'text-[#0B2559]/70 border-transparent hover:text-[#0B2559] hover:bg-[#EAF3FF]'
                }`}
              >
                <i className={`fi ${tab.icon} text-xs ${isActive ? 'text-[#3B82F6]' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-bold flex items-center gap-2 animate-fadeIn">
              <i className="fi fi-rr-check-circle text-base text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 font-bold flex items-center gap-2 animate-fadeIn">
              <i className="fi fi-rr-exclamation text-base text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: Cédula e Identificación Personal */}
          {activeTab === 'personal' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs font-bold text-[#0B2559]">Cédula de Ciudadanía (ID Único en el Sistema):</span>
                  <span className="ml-2 font-mono text-sm font-extrabold text-[#0B2559]">{user.cedula}</span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#B3D9FF] text-[#3B82F6] font-semibold">
                  {isTargetSingleAdmin ? 'Cuenta Maestra de Administrador (No eliminable)' : 'Identificador de cuenta inmutable'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Nombres y Apellidos Completos *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Carolina Méndez Gómez"
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Teléfono / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Ej. 3001234567"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <SearchableLocationSelect
                  label="Lugar Expedición Cédula"
                  value={cedulaIssuePlace}
                  onChange={setCedulaIssuePlace}
                  options={COLOMBIAN_CITIES}
                  searchPlaceholder="Buscar municipio de expedición..."
                />

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Fecha Expedición Cédula
                  </label>
                  <input
                    type="date"
                    value={cedulaIssueDate}
                    onChange={e => setCedulaIssueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Fecha de Nacimiento
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={e => setBirthDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <SearchableLocationSelect
                  label="Lugar de Nacimiento"
                  value={birthPlace}
                  onChange={setBirthPlace}
                  options={COLOMBIAN_CITIES}
                  searchPlaceholder="Buscar municipio de nacimiento..."
                />

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Grupo Sanguíneo / RH
                  </label>
                  <select
                    value={bloodType}
                    onChange={e => setBloodType(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {BLOOD_TYPES.map(rh => (
                      <option key={rh} value={rh}>
                        {rh}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Estado Civil
                  </label>
                  <select
                    value={maritalStatus}
                    onChange={e => setMaritalStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {MARITAL_STATUS_OPTIONS.map(st => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Ubicación y Residencia */}
          {activeTab === 'residence' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SearchableLocationSelect
                  label="Departamento / Estado de Ubicación"
                  required
                  value={locationDepartmentState}
                  onChange={newDept => {
                    setLocationDepartmentState(newDept);
                    const deptCities = getMunicipalitiesByDepartment(newDept);
                    if (deptCities.length > 0) {
                      setLocationCity(deptCities[0]);
                    }
                  }}
                  options={COLOMBIAN_DEPARTMENTS}
                  searchPlaceholder="Buscar departamento..."
                />

                <SearchableLocationSelect
                  label="Ciudad / Municipio de Residencia"
                  required
                  value={locationCity}
                  onChange={setLocationCity}
                  options={getMunicipalitiesByDepartment(locationDepartmentState)}
                  secondaryOptions={ALL_COLOMBIAN_MUNICIPALITIES_WITH_DEPT.map(m => ({
                    label: m.label,
                    value: m.municipality,
                    department: m.department,
                  }))}
                  onSelectSecondaryDepartment={dept => setLocationDepartmentState(dept)}
                  searchPlaceholder="Buscar municipio en Colombia..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Dirección Exacta de Residencia y Barrio *
                  </label>
                  <input
                    type="text"
                    value={residenceAddress}
                    onChange={e => setResidenceAddress(e.target.value)}
                    placeholder="Ej. Carrera 15 # 85-30 Apto 204, Barrio Chico"
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Tipo de Vivienda
                  </label>
                  <select
                    value={residenceType}
                    onChange={e => setResidenceType(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {RESIDENCE_TYPES.map(vt => (
                      <option key={vt} value={vt}>
                        {vt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Estrato / Zona
                  </label>
                  <select
                    value={residenceStratum}
                    onChange={e => setResidenceStratum(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {STRATUM_OPTIONS.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Núcleo Familiar y Emergencia */}
          {activeTab === 'family' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Número de Familiares
                  </label>
                  <select
                    value={familyMembersCount}
                    onChange={e => setFamilyMembersCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    <option value={0}>0 familiares (Vive solo)</option>
                    <option value={1}>1 familiar a cargo</option>
                    <option value={2}>2 familiares</option>
                    <option value={3}>3 familiares</option>
                    <option value={4}>4 familiares</option>
                    <option value={5}>5 familiares</option>
                    <option value={6}>6 o más familiares</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Contacto de Emergencia
                  </label>
                  <input
                    type="text"
                    value={emergencyContactName}
                    onChange={e => setEmergencyContactName(e.target.value)}
                    placeholder="Nombre completo del familiar"
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Parentesco del Contacto
                  </label>
                  <select
                    value={emergencyRelationship}
                    onChange={e => setEmergencyRelationship(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {EMERGENCY_RELATIONSHIPS.map(rel => (
                      <option key={rel} value={rel}>
                        {rel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Teléfono del Contacto
                  </label>
                  <input
                    type="tel"
                    value={emergencyContactPhone}
                    onChange={e => setEmergencyContactPhone(e.target.value)}
                    placeholder="Ej. 3109876543"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B2559] mb-1">
                  Composición Familiar Predeterminada
                </label>
                <select
                  value={familyNotes}
                  onChange={e => setFamilyNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                >
                  {FAMILY_COMPOSITION_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* TAB 4: Datos Bancarios para Pagos */}
          {activeTab === 'bank' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Banco / Billetera Digital
                  </label>
                  <select
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {BANK_OPTIONS.map(b => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Tipo de Cuenta
                  </label>
                  <select
                    value={bankAccountType}
                    onChange={e => setBankAccountType(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {BANK_ACCOUNT_TYPES.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Número de Cuenta / Llave
                  </label>
                  <input
                    type="text"
                    value={bankAccountNumber}
                    onChange={e => setBankAccountNumber(e.target.value)}
                    placeholder="Número de cuenta o celular"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Titular de la Cuenta
                  </label>
                  <select
                    value={bankAccountHolder}
                    onChange={e => setBankAccountHolder(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {BANK_HOLDER_OPTIONS.map(h => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Acceso, Rol, Aprobación y Permisos de Sistema */}
          {activeTab === 'security' && (
            <div className="space-y-5">
              {isTargetSingleAdmin ? (
                <div className="p-4 rounded-xl bg-[#F4F9FF] border-2 border-[#0B2559]/20 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[#D6EAFF]">
                    <div className="flex items-center gap-2">
                      <i className="fi fi-rr-shield-keyhole text-sm text-[#0B2559]" />
                      <span className="text-xs font-extrabold text-[#0B2559] uppercase tracking-wider">
                        Cambio de Contraseña del Único Administrador (C.C. {SINGLE_ADMIN_CEDULA})
                      </span>
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-[#0B2559] text-white">
                      Protegido · No Eliminable
                    </span>
                  </div>

                  <p className="text-xs text-[#0B2559]/80">
                    Para cambiar la contraseña del Administrador debes ingresar el número de cédula de autorización y la contraseña anterior. Si no deseas cambiar la contraseña, deja estos tres campos en blanco.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Cédula de Autorización *
                      </label>
                      <input
                        type="password"
                        autoComplete="off"
                        value={adminAuthCedula}
                        onChange={e => setAdminAuthCedula(e.target.value)}
                        placeholder="Número de cédula autorizado"
                        className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Contraseña Anterior *
                      </label>
                      <input
                        type="password"
                        autoComplete="off"
                        value={adminOldPassword}
                        onChange={e => setAdminOldPassword(e.target.value)}
                        placeholder="Contraseña actual"
                        className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Nueva Contraseña *
                      </label>
                      <input
                        type="password"
                        autoComplete="off"
                        value={adminNewPassword}
                        onChange={e => setAdminNewPassword(e.target.value)}
                        placeholder="Nueva contraseña"
                        className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF]">
                {!isTargetSingleAdmin && (
                  <div>
                    <label className="block text-xs font-bold text-[#0B2559] mb-1">
                      Contraseña de Acceso *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Clave de ingreso"
                        className="w-full px-3 py-2 pr-9 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2 text-[#3B82F6] hover:text-[#0B2559] text-xs"
                        title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      >
                        <i className={`fi ${showPassword ? 'fi-rr-eye-crossed' : 'fi-rr-eye'}`} />
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="correo@fundacionulep.org"
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Departamento / Dependencia
                  </label>
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  >
                    {DEPARTMENT_OPTIONS.map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Rol en la Plataforma
                  </label>
                  <div className="w-full px-3 py-2 text-xs font-bold text-[#0B2559] bg-[#EAF3FF] border border-[#B3D9FF] rounded-lg">
                    {isTargetSingleAdmin ? 'Administrador Único (Fijo)' : 'Panel de Colaborador (Usuario)'}
                  </div>
                </div>

                {!isTargetSingleAdmin && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-[#0B2559] mb-1">
                      Estado de Autorización / Aprobación
                    </label>
                    <select
                      value={approvalStatus}
                      onChange={e => setApprovalStatus(e.target.value as 'aprobado' | 'pendiente' | 'rechazado')}
                      className="w-full px-3 py-2 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                    >
                      <option value="aprobado">Aprobado / Activo (Acceso Total Concedido)</option>
                      <option value="pendiente">Pendiente de Autorización</option>
                      <option value="rechazado">Rechazado / Inactivo</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Matriz de Permisos */}
              <div className="p-4 rounded-xl bg-white border border-[#B3D9FF] space-y-3">
                <div className="text-xs font-bold text-[#0B2559] uppercase tracking-wider flex items-center justify-between">
                  <span>Matriz de Permisos de Acciones Individuales:</span>
                  <span className="text-[11px] text-[#3B82F6] font-normal">
                    {isTargetSingleAdmin
                      ? '(El Administrador Único posee todos los permisos habilitados permanentemente)'
                      : '(Haz clic en cada botón para habilitar o denegar)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {[
                    { label: 'Crear Tareas', value: canCreateTasks, toggle: () => !isTargetSingleAdmin && setCanCreateTasks(!canCreateTasks) },
                    { label: 'Editar Tareas y Progreso', value: canEditTasks, toggle: () => !isTargetSingleAdmin && setCanEditTasks(!canEditTasks) },
                    { label: 'Eliminar Tareas', value: canDeleteTasks, toggle: () => !isTargetSingleAdmin && setCanDeleteTasks(!canDeleteTasks) },
                    { label: 'Enviar Mensajes de Chat', value: canSendChat, toggle: () => !isTargetSingleAdmin && setCanSendChat(!canSendChat) },
                    { label: 'Ver Claves y Bóveda Directa', value: canViewVault, toggle: () => !isTargetSingleAdmin && setCanViewVault(!canViewVault) },
                    { label: 'Exportar Reportes PDF', value: canExportReports, toggle: () => !isTargetSingleAdmin && setCanExportReports(!canExportReports) },
                  ].map(perm => (
                    <button
                      key={perm.label}
                      type="button"
                      disabled={isTargetSingleAdmin}
                      onClick={perm.toggle}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all ${
                        perm.value
                          ? 'bg-[#EAF3FF] text-[#0B2559] border-[#B3D9FF]'
                          : 'bg-rose-50 text-rose-800 border-rose-200 opacity-70'
                      } ${isTargetSingleAdmin ? 'cursor-default' : ''}`}
                    >
                      <span>{perm.label}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          perm.value ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                        }`}
                      >
                        {perm.value ? 'Habilitado' : 'Bloqueado'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-[#D6EAFF] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="text-[11px] text-[#3B82F6]">
              Todos los cambios son auditados y quedan registrados con fecha y usuario administrador.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl hover:bg-[#F4F9FF] transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#1A3A73] rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <i className="fi fi-rr-spinner animate-spin text-xs" />
                    <span>Guardando cambios...</span>
                  </>
                ) : (
                  <>
                    <i className="fi fi-rr-check text-xs text-[#B3D9FF]" />
                    <span>Guardar Cambios del Usuario</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
