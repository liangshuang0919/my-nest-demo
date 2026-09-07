// ------------------- 天气查询工具 -------------------

interface IWeatherQueryArgs {
    location: string; // 地址
}

const handleWeatherQuery = async (args: IWeatherQueryArgs): Promise<string> => {
    const { location } = args;

    return `${location} 天气情况是：******`;
};

export { handleWeatherQuery };
