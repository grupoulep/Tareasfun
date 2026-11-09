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
import { CollapsibleField } from './CollapsibleField';

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
  const [expandAllFields, setExpandAllFields] = useState<boolean | undefined>(undefined);

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
      setExpandAllFields(undefined);
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
    { key: 'personal', label: 'Pantalla 1: Cédula e Identificación', icon: 'fi-rr-id-badge' },
    { key: 'residence', label: 'Pantalla 2: Ubicación y Residencia', icon: 'fi-rr-marker' },
    { key: 'family', label: 'Pantalla 3: Núcleo Familiar', icon: 'fi-rr-users' },
    { key: 'bank', label: 'Pantalla 4: Datos Bancarios', icon: 'fi-rr-bank' },
    { key: 'security', label: 'Pantalla 5: Acceso y Permisos', icon: 'fi-rr-shield-check' },
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
                  {isTargetSingleAdmin ? 'Administrador Único del Sistema' : 'Editar Ficha Personal y Usuario'}
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
                Haz clic en la palabra principal de cada dato para desplegar su cuadro de llenado.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setExpandAllFields(prev => !prev)}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[#B3D9FF] hover:text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors"
              title="Desplegar o minimizar todos los campos de esta pantalla"
            >
              <i className={`fi ${expandAllFields ? 'fi-rr-compress-alt' : 'fi-rr-expand-arrows-alt'} text-xs`} />
              <span className="hidden sm:inline">{expandAllFields ? 'Minimizar Campos' : 'Desplegar Todos'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors text-sm shrink-0"
              title="Cerrar ventana"
            >
              <i className="fi fi-rr-cross text-xs" />
            </button>
          </div>
        </div>

        {/* Selector Rápido de Pantalla en Teléfono */}
        <div className="sm:hidden bg-[#F4F9FF] border-b border-[#D6EAFF] p-3 shrink-0">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#3B82F6] mb-1">
            Seleccionar Pantalla de Edición (5 pantallas):
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
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-white">
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-bold flex items-center gap-2 animate-fadeIn">
              <i className="fi fi-rr-check-circle text-base text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 font-bold flex items-center gap-2 animate-fadeIn">
              <i className="fi fi-rr-exclamation text-base text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* PANTALLA 1: Cédula e Identificación Personal */}
          {activeTab === 'personal' && (
            <div className="space-y-3">
              <div className="p-2.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs font-bold text-[#0B2559]">Cédula (ID Único):</span>
                  <span className="ml-2 font-mono text-sm font-extrabold text-[#0B2559]">{user.cedula}</span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#B3D9FF] text-[#3B82F6] font-semibold">
                  Haz clic en cada frase para desplegar y editar
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <CollapsibleField
                  label="Nombres y Apellidos"
                  valuePreview={name}
                  required
                  icon="fi-rr-user"
                  forceOpen={expandAllFields}
                >
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Carolina Méndez Gómez"
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Teléfono / WhatsApp"
                  valuePreview={phone}
                  required
                  icon="fi-rr-phone-call"
                  forceOpen={expandAllFields}
                >
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Ej. 3001234567"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Lugar Expedición Cédula"
                  valuePreview={cedulaIssuePlace}
                  icon="fi-rr-marker"
                  forceOpen={expandAllFields}
                >
                  <SearchableLocationSelect
                    label=""
                    value={cedulaIssuePlace}
                    onChange={setCedulaIssuePlace}
                    options={COLOMBIAN_CITIES}
                    searchPlaceholder="Buscar municipio de expedición..."
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Fecha Expedición Cédula"
                  valuePreview={cedulaIssueDate}
                  icon="fi-rr-calendar"
                  forceOpen={expandAllFields}
                >
                  <input
                    type="date"
                    value={cedulaIssueDate}
                    onChange={e => setCedulaIssueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Fecha de Nacimiento"
                  valuePreview={birthDate}
                  icon="fi-rr-calendar"
                  forceOpen={expandAllFields}
                >
                  <input
                    type="date"
                    value={birthDate}
                    onChange={e => setBirthDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Lugar de Nacimiento"
                  valuePreview={birthPlace}
                  icon="fi-rr-map-marker"
                  forceOpen={expandAllFields}
                >
                  <SearchableLocationSelect
                    label=""
                    value={birthPlace}
                    onChange={setBirthPlace}
                    options={COLOMBIAN_CITIES}
                    searchPlaceholder="Buscar municipio de nacimiento..."
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Grupo Sanguíneo / RH"
                  valuePreview={bloodType}
                  icon="fi-rr-heart"
                  forceOpen={expandAllFields}
                >
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
                </CollapsibleField>

                <CollapsibleField
                  label="Estado Civil"
                  valuePreview={maritalStatus}
                  icon="fi-rr-users-alt"
                  forceOpen={expandAllFields}
                >
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
                </CollapsibleField>
              </div>
            </div>
          )}

          {/* PANTALLA 2: Ubicación y Residencia */}
          {activeTab === 'residence' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <CollapsibleField
                label="Departamento de Ubicación"
                valuePreview={locationDepartmentState}
                required
                icon="fi-rr-map"
                forceOpen={expandAllFields}
              >
                <SearchableLocationSelect
                  label=""
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
              </CollapsibleField>

              <CollapsibleField
                label="Ciudad / Municipio"
                valuePreview={locationCity}
                required
                icon="fi-rr-marker"
                forceOpen={expandAllFields}
              >
                <SearchableLocationSelect
                  label=""
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
              </CollapsibleField>

              <CollapsibleField
                label="Dirección de Residencia y Barrio"
                valuePreview={residenceAddress}
                required
                icon="fi-rr-home"
                className="sm:col-span-2"
                forceOpen={expandAllFields}
              >
                <input
                  type="text"
                  value={residenceAddress}
                  onChange={e => setResidenceAddress(e.target.value)}
                  placeholder="Ej. Carrera 15 # 85-30 Apto 204, Barrio Chico"
                  className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Tipo de Vivienda"
                valuePreview={residenceType}
                icon="fi-rr-building"
                forceOpen={expandAllFields}
              >
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
              </CollapsibleField>

              <CollapsibleField
                label="Estrato / Zona"
                valuePreview={residenceStratum}
                icon="fi-rr-layers"
                forceOpen={expandAllFields}
              >
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
              </CollapsibleField>
            </div>
          )}

          {/* PANTALLA 3: Núcleo Familiar y Emergencia */}
          {activeTab === 'family' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <CollapsibleField
                label="Número de Familiares"
                valuePreview={`${familyMembersCount} familiar(es)`}
                icon="fi-rr-users"
                forceOpen={expandAllFields}
              >
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
              </CollapsibleField>

              <CollapsibleField
                label="Contacto de Emergencia"
                valuePreview={emergencyContactName}
                icon="fi-rr-user-add"
                forceOpen={expandAllFields}
              >
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={e => setEmergencyContactName(e.target.value)}
                  placeholder="Nombre completo del familiar"
                  className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Parentesco del Contacto"
                valuePreview={emergencyRelationship}
                icon="fi-rr-heart"
                forceOpen={expandAllFields}
              >
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
              </CollapsibleField>

              <CollapsibleField
                label="Teléfono de Emergencia"
                valuePreview={emergencyContactPhone}
                icon="fi-rr-phone-call"
                forceOpen={expandAllFields}
              >
                <input
                  type="tel"
                  value={emergencyContactPhone}
                  onChange={e => setEmergencyContactPhone(e.target.value)}
                  placeholder="Ej. 3109876543"
                  className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Composición Familiar"
                valuePreview={familyNotes}
                icon="fi-rr-document"
                className="sm:col-span-2"
                forceOpen={expandAllFields}
              >
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
              </CollapsibleField>
            </div>
          )}

          {/* PANTALLA 4: Datos Bancarios para Pagos */}
          {activeTab === 'bank' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <CollapsibleField
                label="Banco / Billetera Digital"
                valuePreview={bankName}
                icon="fi-rr-bank"
                forceOpen={expandAllFields}
              >
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
              </CollapsibleField>

              <CollapsibleField
                label="Tipo de Cuenta"
                valuePreview={bankAccountType}
                icon="fi-rr-credit-card"
                forceOpen={expandAllFields}
              >
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
              </CollapsibleField>

              <CollapsibleField
                label="Número de Cuenta / Llave"
                valuePreview={bankAccountNumber}
                icon="fi-rr-hastag"
                forceOpen={expandAllFields}
              >
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={e => setBankAccountNumber(e.target.value)}
                  placeholder="Número de cuenta o celular"
                  className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Titular de la Cuenta"
                valuePreview={bankAccountHolder}
                icon="fi-rr-id-card-clip-alt"
                forceOpen={expandAllFields}
              >
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
              </CollapsibleField>
            </div>
          )}

          {/* PANTALLA 5: Acceso, Rol, Aprobación y Permisos */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              {isTargetSingleAdmin ? (
                <div className="p-3.5 rounded-xl bg-[#F4F9FF] border-2 border-[#0B2559]/20 space-y-3">
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
                    Haz clic en cada palabra clave para desplegar su casilla si deseas cambiar la contraseña del Administrador.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <CollapsibleField
                      label="Cédula de Autorización"
                      valuePreview={adminAuthCedula}
                      required
                      isSecret
                      icon="fi-rr-id-badge"
                      forceOpen={expandAllFields}
                    >
                      <input
                        type="password"
                        autoComplete="off"
                        value={adminAuthCedula}
                        onChange={e => setAdminAuthCedula(e.target.value)}
                        placeholder="Cédula autorizada"
                        className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                      />
                    </CollapsibleField>

                    <CollapsibleField
                      label="Contraseña Anterior"
                      valuePreview={adminOldPassword}
                      required
                      isSecret
                      icon="fi-rr-lock"
                      forceOpen={expandAllFields}
                    >
                      <input
                        type="password"
                        autoComplete="off"
                        value={adminOldPassword}
                        onChange={e => setAdminOldPassword(e.target.value)}
                        placeholder="Contraseña actual"
                        className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                      />
                    </CollapsibleField>

                    <CollapsibleField
                      label="Nueva Contraseña"
                      valuePreview={adminNewPassword}
                      required
                      isSecret
                      icon="fi-rr-key"
                      forceOpen={expandAllFields}
                    >
                      <input
                        type="password"
                        autoComplete="off"
                        value={adminNewPassword}
                        onChange={e => setAdminNewPassword(e.target.value)}
                        placeholder="Nueva contraseña"
                        className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                      />
                    </CollapsibleField>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {!isTargetSingleAdmin && (
                  <CollapsibleField
                    label="Contraseña de Acceso"
                    valuePreview={password}
                    required
                    isSecret={!showPassword}
                    icon="fi-rr-key"
                    forceOpen={expandAllFields}
                  >
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
                  </CollapsibleField>
                )}

                <CollapsibleField
                  label="Correo Electrónico"
                  valuePreview={email}
                  icon="fi-rr-envelope"
                  forceOpen={expandAllFields}
                >
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="correo@fundacionulep.org"
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Departamento / Dependencia"
                  valuePreview={department}
                  icon="fi-rr-briefcase"
                  forceOpen={expandAllFields}
                >
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
                </CollapsibleField>

                {!isTargetSingleAdmin && (
                  <CollapsibleField
                    label="Estado de Autorización"
                    valuePreview={approvalStatus.toUpperCase()}
                    icon="fi-rr-user-check"
                    forceOpen={expandAllFields}
                  >
                    <select
                      value={approvalStatus}
                      onChange={e => setApprovalStatus(e.target.value as 'aprobado' | 'pendiente' | 'rechazado')}
                      className="w-full px-3 py-2 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                    >
                      <option value="aprobado">Aprobado / Activo (Acceso Total Concedido)</option>
                      <option value="pendiente">Pendiente de Autorización</option>
                      <option value="rechazado">Rechazado / Inactivo</option>
                    </select>
                  </CollapsibleField>
                )}
              </div>

              {/* Matriz de Permisos */}
              <div className="p-3.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-2.5">
                <div className="text-xs font-bold text-[#0B2559] uppercase tracking-wider flex items-center justify-between flex-wrap gap-1">
                  <span>Matriz de Permisos de Acciones Individuales:</span>
                  <span className="text-[11px] text-[#3B82F6] font-normal">
                    {isTargetSingleAdmin
                      ? '(Administrador Único: todos habilitados)'
                      : '(Clic en cada permiso para cambiar)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                          ? 'bg-white text-[#0B2559] border-[#B3D9FF]'
                          : 'bg-rose-50 text-rose-800 border-rose-200 opacity-75'
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
