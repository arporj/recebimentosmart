import { CustomFieldsManager } from '../components/CustomFieldsManager';

const CamposPersonalizados = () => {
  return (
    <div className="container mx-auto p-4 bg-neutral-50">
      <h1 className="text-2xl font-bold mb-4 text-neutral-800">Campos Personalizados</h1>
      <CustomFieldsManager />
    </div>
  );
};

export default CamposPersonalizados;