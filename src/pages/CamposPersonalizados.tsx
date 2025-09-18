import { CustomFieldsManager } from '../components/CustomFieldsManager';

const CamposPersonalizados = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Campos Personalizados</h1>
      <CustomFieldsManager />
    </div>
  );
};

export default CamposPersonalizados;